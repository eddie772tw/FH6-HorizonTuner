use tauri::{Manager, Runtime};

// Size is configured in logical pixels; constrain the decorated window to the
// selected monitor's physical work area (including non-primary/negative origins).
pub fn fit_to_work_area<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    if let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) {
        let area = monitor.work_area();
        let outer = window.outer_size()?;
        let inner = window.inner_size()?;
        let border_width = outer.width.saturating_sub(inner.width);
        let border_height = outer.height.saturating_sub(inner.height);
        let width = inner
            .width
            .min(area.size.width.saturating_sub(border_width))
            .max(1);
        let height = inner
            .height
            .min(area.size.height.saturating_sub(border_height))
            .max(1);
        window.set_size(tauri::PhysicalSize::new(width, height))?;
        window.set_position(tauri::PhysicalPosition::new(
            area.position.x + area.size.width.saturating_sub(width + border_width) as i32 / 2,
            area.position.y + area.size.height.saturating_sub(height + border_height) as i32 / 2,
        ))?;
    }
    Ok(())
}
