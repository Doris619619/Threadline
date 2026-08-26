//! Threadline Windows desktop entry point and native single-instance activation.

use tauri::{Emitter, Manager, Runtime};

const SECOND_INSTANCE_ACTIVATED_EVENT: &str = "threadline://second-instance-activated";

/// Restores the existing main window and informs the WebView about a second launch.
fn activate_existing_window<R: Runtime>(app: &tauri::AppHandle<R>) {
  let Some(window) = app.get_webview_window("main") else {
    return;
  };

  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();
  let _ = window.emit(SECOND_INSTANCE_ACTIVATED_EVENT, ());
}

/// Builds and runs the Threadline Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      activate_existing_window(app);
    }))
    .setup(|app| {
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
