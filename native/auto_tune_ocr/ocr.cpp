#define NOMINMAX
// GDI+ requires the Windows and COM declarations before its own headers.
// clang-format off
#include <windows.h>
#include <objidl.h>
#include <gdiplus.h>
// clang-format on
#include <onnxruntime_cxx_api.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
using Gdiplus::Bitmap;
using Gdiplus::Rect;
using Gdiplus::RectF;

struct Pixels {
  int width;
  int height;
  std::vector<unsigned char> bgr;
};

class Gdi {
public:
  Gdi() {
    Gdiplus::GdiplusStartupInput config;
    if (Gdiplus::GdiplusStartup(&token_, &config, nullptr))
      throw std::runtime_error("GDI+ initialization failed");
  }
  ~Gdi() { Gdiplus::GdiplusShutdown(token_); }

private:
  ULONG_PTR token_{};
};

Pixels pixels(Bitmap &bitmap) {
  Pixels result{int(bitmap.GetWidth()), int(bitmap.GetHeight()), {}};
  result.bgr.resize(size_t(result.width) * result.height * 3);
  Gdiplus::BitmapData data{};
  Rect bounds(0, 0, result.width, result.height);
  if (bitmap.LockBits(&bounds, Gdiplus::ImageLockModeRead, PixelFormat24bppRGB,
                      &data))
    throw std::runtime_error("Cannot read PNG pixels");
  for (int y = 0; y < result.height; ++y)
    std::memcpy(result.bgr.data() + size_t(y) * result.width * 3,
                static_cast<unsigned char *>(data.Scan0) +
                    ptrdiff_t(y) * data.Stride,
                size_t(result.width) * 3);
  bitmap.UnlockBits(&data);
  return result;
}

std::unique_ptr<Bitmap> resized(Bitmap &source, RectF crop, int width,
                                int height) {
  auto bitmap = std::make_unique<Bitmap>(width, height, PixelFormat24bppRGB);
  Gdiplus::Graphics graphics(bitmap.get());
  graphics.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
  if (graphics.DrawImage(&source, RectF(0, 0, float(width), float(height)),
                         crop.X, crop.Y, crop.Width, crop.Height,
                         Gdiplus::UnitPixel))
    throw std::runtime_error("Cannot resize crop");
  return bitmap;
}

class Model {
public:
  Model(Ort::Env &env, const std::filesystem::path &file, int threads)
      : session_(nullptr) {
    Ort::SessionOptions options;
    options.SetIntraOpNumThreads(threads);
    options.SetInterOpNumThreads(1);
    options.AddConfigEntry("session.intra_op.allow_spinning", "0");
    options.AddConfigEntry("session.inter_op.allow_spinning", "0");
    session_ = Ort::Session(env, file.c_str(), options);
    Ort::AllocatorWithDefaultOptions allocator;
    input_ = session_.GetInputNameAllocated(0, allocator).get();
    output_ = session_.GetOutputNameAllocated(0, allocator).get();
  }

  Ort::Value run(std::vector<float> &data, int height, int width) {
    std::array<int64_t, 4> shape{1, 3, height, width};
    auto memory =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    auto tensor = Ort::Value::CreateTensor<float>(
        memory, data.data(), data.size(), shape.data(), shape.size());
    const char *inputs[]{input_.c_str()};
    const char *outputs[]{output_.c_str()};
    auto result =
        session_.Run(Ort::RunOptions{nullptr}, inputs, &tensor, 1, outputs, 1);
    return std::move(result.front());
  }

private:
  Ort::Session session_;
  std::string input_, output_;
};

struct Reading {
  std::string text;
  float confidence = 0;
};

class Engine {
public:
  explicit Engine(const std::filesystem::path &directory, int threads)
      : environment_(ORT_LOGGING_LEVEL_ERROR, "FH6 OCR"),
        recognition_(environment_, directory / "rec.onnx", threads),
        detection_(environment_, directory / "det.onnx", threads) {
    std::ifstream dictionary(directory / "keys.txt");
    if (!dictionary)
      throw std::runtime_error("Cannot read OCR dictionary");
    keys_.emplace_back("");
    std::string word;
    while (std::getline(dictionary, word)) {
      if (!word.empty() && word.back() == '\r')
        word.pop_back();
      keys_.push_back(word);
    }
    keys_.emplace_back(" ");
    if (keys_.size() < 10)
      throw std::runtime_error("Empty OCR dictionary");
  }

  void open(const wchar_t *path) {
    auto image = std::make_unique<Bitmap>(path);
    if (image->GetLastStatus() || image->GetWidth() == 0 ||
        image->GetHeight() == 0 || image->GetWidth() > 16384 ||
        image->GetHeight() > 16384)
      throw std::runtime_error("Invalid PNG dimensions or path");
    frame_ = std::move(image);
  }

  Reading read(double x, double y, double width, double height, int mode,
               int scale, int padding, int threshold, bool only_rec) {
    if (!frame_)
      throw std::runtime_error("No frame opened");
    if (!std::isfinite(x + y + width + height) || x < 0 || y < 0 ||
        width <= 0 || height <= 0 || x + width > 1.000001 ||
        y + height > 1.000001)
      throw std::runtime_error("Invalid normalized crop");
    int left = int(std::floor(x * frame_->GetWidth()));
    int top = int(std::floor(y * frame_->GetHeight()));
    int right = std::min(int(frame_->GetWidth()),
                         int(std::ceil((x + width) * frame_->GetWidth())));
    int bottom = std::min(int(frame_->GetHeight()),
                          int(std::ceil((y + height) * frame_->GetHeight())));
    auto crop = resized(*frame_,
                        RectF(float(left), float(top), float(right - left),
                              float(bottom - top)),
                        right - left, bottom - top);
    if (mode)
      crop = mask(*crop, mode == 1, scale, padding, threshold);
    if (only_rec)
      return recognize(*crop, RectF(0, 0, float(crop->GetWidth()),
                                    float(crop->GetHeight())));
    auto boxes = detect(*crop);
    Reading result;
    double confidence = 0;
    int accepted = 0;
    for (const auto &box : boxes) {
      auto line = recognize(*crop, box);
      if (line.text.empty() || line.confidence < 0.3f)
        continue;
      if (!result.text.empty())
        result.text += "\n";
      result.text += line.text;
      confidence += line.confidence;
      ++accepted;
    }
    result.confidence = accepted ? float(confidence / accepted) : 0;
    return result;
  }

private:
  std::unique_ptr<Bitmap> mask(Bitmap &source, bool light, int scale,
                               int padding, int threshold) {
    if (scale < 1 || scale > 4 || padding < 0 || padding > 128 ||
        threshold < 0 || threshold > 255)
      throw std::runtime_error("Invalid masking parameters");
    auto raw = pixels(source);
    int width = raw.width * scale + padding * 2;
    int height = raw.height * scale + padding * 2;
    auto target = std::make_unique<Bitmap>(width, height, PixelFormat24bppRGB);
    Gdiplus::Graphics graphics(target.get());
    graphics.Clear(Gdiplus::Color::White);
    Gdiplus::BitmapData data{};
    Rect bounds(0, 0, width, height);
    if (target->LockBits(&bounds, Gdiplus::ImageLockModeWrite,
                         PixelFormat24bppRGB, &data))
      throw std::runtime_error("Mask allocation failed");
    for (int y = 0; y < height; ++y)
      std::memset(static_cast<unsigned char *>(data.Scan0) +
                      ptrdiff_t(y) * data.Stride,
                  255, width * 3);
    for (int y = 0; y < raw.height; ++y)
      for (int x = 0; x < raw.width; ++x) {
        const auto *p = raw.bgr.data() + (size_t(y) * raw.width + x) * 3;
        int low = std::min({p[0], p[1], p[2]}),
            high = std::max({p[0], p[1], p[2]});
        bool ink = light ? ((low > threshold && high - low < 90) ||
                            (p[2] > 170 && p[1] > 170 && p[0] < 100))
                         : high < 185;
        if (!ink)
          continue;
        for (int dy = 0; dy < scale; ++dy)
          for (int dx = 0; dx < scale; ++dx) {
            auto *p = static_cast<unsigned char *>(data.Scan0) +
                      ptrdiff_t(y * scale + padding + dy) * data.Stride +
                      (x * scale + padding + dx) * 3;
            p[0] = p[1] = p[2] = 0;
          }
      }
    target->UnlockBits(&data);
    return target;
  }

  Reading recognize(Bitmap &source, RectF crop) {
    constexpr int height = 48;
    int width =
        std::clamp(int(std::ceil(height * crop.Width / crop.Height)), 1, 4096);
    int padded = std::max(320, width);
    auto image = resized(source, crop, width, height);
    auto raw = pixels(*image);
    std::vector<float> input(size_t(3) * height * padded, 0);
    for (int y = 0; y < height; ++y)
      for (int x = 0; x < width; ++x)
        for (int c = 0; c < 3; ++c)
          input[(size_t(c) * height + y) * padded + x] =
              raw.bgr[(size_t(y) * width + x) * 3 + c] / 127.5f - 1;
    auto output = recognition_.run(input, height, padded);
    auto shape = output.GetTensorTypeAndShapeInfo().GetShape();
    if (shape.size() != 3 || shape[0] != 1 || shape[2] != int64_t(keys_.size()))
      throw std::runtime_error("Recognition model/dictionary mismatch");
    const float *scores = output.GetTensorData<float>();
    Reading result;
    double confidence = 0;
    int previous = -1, count = 0;
    for (int64_t t = 0; t < shape[1]; ++t) {
      const float *row = scores + t * shape[2];
      int k = int(std::max_element(row, row + shape[2]) - row);
      if (k && k != previous) {
        result.text += keys_[k];
        confidence += row[k];
        ++count;
      }
      previous = k;
    }
    result.confidence = count ? float(confidence / count) : 0;
    return result;
  }

  std::vector<RectF> detect(Bitmap &source) {
    // DB probability map, axis-aligned boxes for horizontal FH6 menu text.
    float ratio =
        std::min(1.f, 960.f / std::max(source.GetWidth(), source.GetHeight()));
    int width =
        std::max(32, int(std::round(source.GetWidth() * ratio / 32)) * 32);
    int height =
        std::max(32, int(std::round(source.GetHeight() * ratio / 32)) * 32);
    auto image = resized(
        source,
        RectF(0, 0, float(source.GetWidth()), float(source.GetHeight())), width,
        height);
    auto raw = pixels(*image);
    constexpr std::array<float, 3> means{0.485f, 0.456f, 0.406f};
    constexpr std::array<float, 3> deviations{0.229f, 0.224f, 0.225f};
    std::vector<float> input(size_t(3) * height * width);
    for (int y = 0; y < height; ++y)
      for (int x = 0; x < width; ++x)
        for (int c = 0; c < 3; ++c)
          input[(size_t(c) * height + y) * width + x] =
              (raw.bgr[(size_t(y) * width + x) * 3 + c] / 255.f - means[c]) /
              deviations[c];
    auto tensor = detection_.run(input, height, width);
    auto shape = tensor.GetTensorTypeAndShapeInfo().GetShape();
    if (shape.size() != 4 || shape[0] != 1 || shape[1] != 1 || shape[2] <= 0 ||
        shape[3] <= 0)
      throw std::runtime_error("Invalid detection model output");
    int h = int(shape[2]), w = int(shape[3]);
    const float *map = tensor.GetTensorData<float>();
    std::vector<unsigned char> seen(size_t(h) * w, 0);
    std::vector<RectF> boxes;
    for (int y = 0; y < h; ++y)
      for (int x = 0; x < w; ++x) {
        int start = y * w + x;
        if (seen[start] || map[start] < 0.3f)
          continue;
        std::vector<int> stack{start};
        seen[start] = 1;
        int left = x, right = x, top = y, bottom = y, count = 0;
        double score = 0;
        while (!stack.empty()) {
          int pos = stack.back();
          stack.pop_back();
          int px = pos % w, py = pos / w;
          left = std::min(left, px);
          right = std::max(right, px);
          top = std::min(top, py);
          bottom = std::max(bottom, py);
          score += map[pos];
          ++count;
          for (const auto &offset : std::array<std::array<int, 2>, 4>{
                   {{-1, 0}, {1, 0}, {0, -1}, {0, 1}}}) {
            int nx = px + offset[0], ny = py + offset[1];
            if (nx < 0 || nx >= w || ny < 0 || ny >= h)
              continue;
            int next = ny * w + nx;
            if (!seen[next] && map[next] >= 0.3f) {
              seen[next] = 1;
              stack.push_back(next);
            }
          }
        }
        if (count < 3 || bottom - top < 2 || score / count < 0.5)
          continue;
        float bw = float(right - left + 1), bh = float(bottom - top + 1);
        float expand = 1.5f * bw * bh / (2 * (bw + bh));
        float x0 = std::max(0.f, left - expand),
              y0 = std::max(0.f, top - expand);
        float x1 = std::min(float(w), right + 1 + expand),
              y1 = std::min(float(h), bottom + 1 + expand);
        boxes.emplace_back(x0 * source.GetWidth() / w,
                           y0 * source.GetHeight() / h,
                           (x1 - x0) * source.GetWidth() / w,
                           (y1 - y0) * source.GetHeight() / h);
      }
    std::stable_sort(boxes.begin(), boxes.end(),
                     [](const RectF &a, const RectF &b) { return a.Y < b.Y; });
    // Text boxes on the same line are ordered left-to-right.
    for (size_t first = 0; first < boxes.size();) {
      size_t end = first + 1;
      while (end < boxes.size() &&
             std::abs(boxes[end].Y - boxes[first].Y) <
                 std::min(boxes[end].Height, boxes[first].Height) * 0.5f)
        ++end;
      std::stable_sort(
          boxes.begin() + first, boxes.begin() + end,
          [](const RectF &a, const RectF &b) { return a.X < b.X; });
      first = end;
    }
    return boxes;
  }

  Gdi gdi_;
  Ort::Env environment_;
  Model recognition_, detection_;
  std::vector<std::string> keys_;
  std::unique_ptr<Bitmap> frame_;
};

void copy(const std::string &value, char *buffer, size_t capacity) {
  if (!buffer || !capacity)
    return;
  size_t length = std::min(value.size(), capacity - 1);
  std::memcpy(buffer, value.data(), length);
  buffer[length] = 0;
}
} // namespace

extern "C" {
__declspec(dllexport) void *fh6_ocr_create(const wchar_t *directory,
                                           int threads, char *error,
                                           size_t capacity) {
  try {
    if (!directory || threads < 1 || threads > 16)
      throw std::runtime_error("Invalid OCR configuration");
    return new Engine(directory, threads);
  } catch (const std::exception &e) {
    copy(e.what(), error, capacity);
    return nullptr;
  }
}
__declspec(dllexport) void fh6_ocr_destroy(void *context) {
  delete static_cast<Engine *>(context);
}
__declspec(dllexport) int fh6_ocr_open(void *context, const wchar_t *path,
                                       char *error, size_t capacity) {
  try {
    if (!context || !path)
      throw std::runtime_error("Invalid OCR context");
    static_cast<Engine *>(context)->open(path);
    return 0;
  } catch (const std::exception &e) {
    copy(e.what(), error, capacity);
    return -1;
  }
}
__declspec(dllexport) int fh6_ocr_read(void *context, double x, double y,
                                       double width, double height, int mode,
                                       int scale, int padding, int threshold,
                                       int only_rec, char *text,
                                       size_t capacity, float *confidence,
                                       char *error, size_t error_capacity) {
  try {
    if (!context || !text || !confidence)
      throw std::runtime_error("Invalid OCR context");
    auto result = static_cast<Engine *>(context)->read(
        x, y, width, height, mode, scale, padding, threshold, only_rec != 0);
    if (result.text.size() >= capacity)
      throw std::runtime_error("OCR text exceeds output capacity");
    copy(result.text, text, capacity);
    *confidence = result.confidence;
    return 0;
  } catch (const std::exception &e) {
    copy(e.what(), error, error_capacity);
    return -1;
  }
}
}
