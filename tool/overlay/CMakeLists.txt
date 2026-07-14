cmake_minimum_required(VERSION 3.15)
project(HorizonTunerOverlay LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 設為 Release 預設以達到最佳效能
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

include(FetchContent)

# 1. 獲取 nlohmann/json
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# 2. 獲取 ImGui
FetchContent_Declare(
    imgui
    GIT_REPOSITORY https://github.com/ocornut/imgui.git
    GIT_TAG v1.90.4
)
FetchContent_GetProperties(imgui)
if(NOT imgui_POPULATED)
    FetchContent_Populate(imgui)
    
    # 建立 ImGui 靜態庫，包含核心與 Win32/D3D11 後端
    add_library(imgui STATIC
        ${imgui_SOURCE_DIR}/imgui.cpp
        ${imgui_SOURCE_DIR}/imgui_demo.cpp
        ${imgui_SOURCE_DIR}/imgui_draw.cpp
        ${imgui_SOURCE_DIR}/imgui_tables.cpp
        ${imgui_SOURCE_DIR}/imgui_widgets.cpp
        ${imgui_SOURCE_DIR}/backends/imgui_impl_win32.cpp
        ${imgui_SOURCE_DIR}/backends/imgui_impl_dx11.cpp
    )
    
    target_include_directories(imgui PUBLIC 
        ${imgui_SOURCE_DIR}
        ${imgui_SOURCE_DIR}/backends
    )
    
    # 讓編譯器能找到 Win32 SDK 及 D3D
    target_compile_definitions(imgui PRIVATE UNICODE _UNICODE)
endif()

# 3. 建立 Overlay 執行檔 (設置為 Windows 視窗應用，無主控台)
add_executable(HorizonTunerOverlay WIN32
    main.cpp
    DXGIOverlayManager.h
    DXGIOverlayManager.cpp
    WebSocketClient.h
)

# 4. 設定編譯參數與連結庫
target_compile_definitions(HorizonTunerOverlay PRIVATE UNICODE _UNICODE NOMINMAX)
target_include_directories(HorizonTunerOverlay PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# 連結 ImGui, nlohmann/json 與系統 DX/網路庫
target_link_libraries(HorizonTunerOverlay PRIVATE
    imgui
    nlohmann_json::nlohmann_json
    d3d11
    dxgi
    winhttp
)

# 設定輸出的執行檔名稱
set_target_properties(HorizonTunerOverlay PROPERTIES
    OUTPUT_NAME "HorizonTunerOverlay"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
