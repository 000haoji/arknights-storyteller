package com.arknights.storyreader.updater

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

@InvokeArg
class DownloadArgs {
  lateinit var url: String
  var fileName: String? = null
}

@TauriPlugin
class ApkUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val httpClient = OkHttpClient()

  @Command
  fun downloadAndInstall(invoke: Invoke) {
    val args = invoke.parseArgs(DownloadArgs::class.java)
    val requestUrl = args.url.trim()
    if (requestUrl.isEmpty()) {
      invoke.reject("更新地址无效")
      return
    }

    scope.launch {
      try {
        val apkFile = downloadApk(requestUrl, args.fileName)

        if (!canRequestPackageInstalls()) {
          val result = JSObject()
          result.put("needsPermission", true)
          runOnMain { invoke.resolve(result) }
          return@launch
        }

        runOnMain {
          promptInstall(apkFile)
          val result = JSObject()
          result.put("status", "install-intent-launched")
          invoke.resolve(result)
        }
      } catch (error: Exception) {
        runOnMain { invoke.reject(error.message ?: "下载更新失败") }
      }
    }
  }

  @Command
  fun openInstallPermissionSettings(invoke: Invoke) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val intent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${activity.packageName}")
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
    }
    invoke.resolve()
  }

  private suspend fun downloadApk(url: String, fileName: String?): File =
    withContext(Dispatchers.IO) {
      val request = Request.Builder().url(url).build()
      httpClient.newCall(request).execute().use { response ->
        if (!response.isSuccessful) {
          throw IOException("HTTP ${response.code}")
        }
        val body = response.body ?: throw IOException("响应体为空")
        val name = fileName?.takeIf { it.isNotBlank() }
          ?: "update-${System.currentTimeMillis()}.apk"
        val outputFile = File(activity.cacheDir, name)
        body.byteStream().use { input ->
          FileOutputStream(outputFile).use { output ->
            input.copyTo(output)
          }
        }
        outputFile
      }
    }

  private fun canRequestPackageInstalls(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      activity.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
  }

  private fun promptInstall(apkFile: File) {
    val uri = FileProvider.getUriForFile(
      activity,
      "${activity.packageName}.fileprovider",
      apkFile
    )
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    activity.startActivity(intent)
  }

  private fun runOnMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
    } else {
      activity.runOnUiThread(block)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    scope.cancel()
  }
}
