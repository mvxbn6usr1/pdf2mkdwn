use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      #[cfg(target_os = "macos")]
      {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        let window = app.get_webview_window("main").unwrap();
        apply_vibrancy(&window, NSVisualEffectMaterial::FullScreenUI, None, None)
          .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
