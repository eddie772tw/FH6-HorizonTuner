# S650 HMI Media Properties Contract

## 調查結論

截至 2026-09-03，本機安裝的 `winrt-Windows.Media.Control==3.2.1` 可載入
`GlobalSystemMediaTransportControlsSessionMediaProperties`，並暴露以下 10 個
media-properties 欄位：`title`、`artist`、`album_title`、`album_artist`、
`album_track_count`、`track_number`、`genres`、`playback_type`、`subtitle`、
`thumbnail`。完整欄位實際為：

| GSMTC 欄位 | S650 JSON 欄位 | 目前 HMI | 說明 |
| --- | --- | --- | --- |
| `Title` | `title` | 使用中 | 歌曲標題 |
| `Artist` | `artist` | 使用中 | 演出藝人 |
| `AlbumTitle` | `album_title` | 使用中 | 專輯名稱 |
| `AlbumArtist` | `album_artist` | 契約已宣告 | 專輯藝人，預留更細緻署名顯示 |
| `AlbumTrackCount` | `album_track_count` | 契約已宣告 | 專輯總曲數，現階段不佔用畫面 |
| `TrackNumber` | `track_number` | 契約已宣告 | 當前曲序，現階段不佔用畫面 |
| `Genres` | `genres` | 契約已宣告 | 最多保留 8 個非空曲風字串，現階段不佔用畫面 |
| `PlaybackType` | `playback_type` | 契約已宣告 | `music` / `video` / `image` / `unknown`，現階段不佔用畫面 |
| `Subtitle` | `subtitle` | 契約已宣告 | 副標題／版本資訊，現階段不佔畫面 |
| `Thumbnail` | `thumbnail_url` + `thumbnail_available` | 使用中 | WinRT `RandomAccessStream` 以 10 MiB 上限讀入單槽快取；HUD 只接收內容 hash URL，不在 WebSocket 傳送圖片 bytes |

`backend/system_media_contract.py` 將 WinRT 物件轉成 bounded JSON；
`hud_overlay/s650_hmi/assets/s650_contract.js` 再做 HUD 邊界的型別與數值正規化。
因此沒有 metadata 時，欄位仍存在並以 `null`、空陣列或明確的 capability default
表示，不會讓 renderer 猜測播放器行為。

後續 Windows 實機驗證已確認背景 Spotify session 可提供曲目、藝人、專輯、時間軸
與 PNG thumbnail。後端將圖片保存在單槽記憶體快取，並透過
`GET /api/overlay/media/thumbnail?v={hash}` 提供 ETag 與 immutable cache；若 URL hash
已不是目前單槽內容，端點回傳 404，避免把新封面快取到舊內容位址。不同播放器是否
完整填入 album、genres、subtitle 與 thumbnail 仍取決於來源 app 的 GSMTC 實作。

## 目前已加入的播放狀態契約

除了 media-properties，後端也保留 GSMTC 的播放與時間軸資料：

- `status`、`playback_rate`、`is_shuffle_active`、`repeat_mode`
- `position_seconds`、`start_seconds`、`duration_seconds`
- `min_seek_seconds`、`max_seek_seconds`、`timeline_last_updated_ms`
- `can_seek`
- `playback_controls`：所有目前 `PlaybackControls` capability flags
- `source_app_user_model_id`：已納入診斷／路由預留欄位，但不顯示在 HMI

S650 的 `music` center widget 現在聚焦顯示封面、曲目、藝人、專輯、進度條與時間；
播放狀態只用 `▶`、`Ⅱ`、`■` 等符號文字提示，不顯示狀態／播放類型文字。
當 artwork 尚未能以可繪製來源傳入時，封面區塊使用曲目縮寫作為 fallback。它是唯讀
頁面，沿用既有 `hud:media` 事件，不會在 60 Hz UDP 接收路徑加入 I/O，也不會自行
呼叫播放控制命令。

## 未使用欄位與深度整合預留

Microsoft API 也提供下列未在本次 HMI 啟用的入口，完整能力與限制另見獨立研究
task：

- `Thumbnail` 格式驗證與多項 LRU：目前已實作 10 MiB 大小上限、單槽快取與
  Canvas `Image` 解碼；未來若要保留歷史封面或接受更多來源格式，仍需增加明確的
  MIME／magic-byte 驗證與 bounded multi-entry eviction policy。
- `PlaybackControls`：可判斷 `TryPlayAsync`、`TryPauseAsync`、
  `TryTogglePlayPauseAsync`、上一首／下一首、seek、repeat、shuffle、rate 等命令
  是否被來源 app 支援；目前只序列化 capability，不執行命令。
- Session events：`MediaPropertiesChanged`、`PlaybackInfoChanged`、
  `TimelinePropertiesChanged` 可取代固定輪詢或作為低延遲 invalidation hint；
  目前維持 backend 每秒 bounded snapshot，避免 event handler lifecycle、跨執行緒
  cleanup 與多 overlay client fan-out 複雜化。
- Session manager events：`CurrentSessionChanged` 可在播放器切換時重建監聽；目前
  `get_current_session()` 的查詢邊界已保留，尚未長駐註冊 manager event。
- `source_app_user_model_id`：未來可用來顯示來源 app、做播放器特定 capability
  策略或診斷統計；不應直接當成可執行檔路徑或信任邊界。

官方欄位與 API 依據：

- [GlobalSystemMediaTransportControlsSessionMediaProperties](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmediaproperties)
- [GlobalSystemMediaTransportControlsSession](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession)
- [GlobalSystemMediaTransportControlsSessionPlaybackInfo](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionplaybackinfo)
- [GlobalSystemMediaTransportControlsSessionPlaybackControls](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionplaybackcontrols)
- [GlobalSystemMediaTransportControlsSessionTimelineProperties](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessiontimelineproperties)
