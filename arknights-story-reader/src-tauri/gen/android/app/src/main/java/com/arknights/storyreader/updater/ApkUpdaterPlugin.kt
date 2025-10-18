package com.arknights.storyreader.updater

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Looper
import android.provider.MediaStore
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

@InvokeArg
class SaveToDownloadsArgs {
  lateinit var sourceFilePath: String
  lateinit var fileName: String
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

  @Command
  fun saveApkToDownloads(invoke: Invoke) {
    val args = invoke.parseArgs(SaveToDownloadsArgs::class.java)
    val sourceFilePath = args.sourceFilePath.trim()
    val fileName = args.fileName.trim().ifEmpty { "update-${System.currentTimeMillis()}.apk" }

    if (sourceFilePath.isEmpty()) {
      invoke.reject("源文件路径无效")
      return
    }

    scope.launch {
      try {
        val result = saveToDownloadsFolder(sourceFilePath, fileName)
        val response = JSObject()
        response.put("success", true)
        response.put("filePath", result)
        response.put("message", "APK 已保存到下载文件夹: $fileName")
        runOnMain { invoke.resolve(response) }
      } catch (error: Exception) {
        runOnMain { invoke.reject(error.message ?: "保存文件失败") }
      }
    }
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

  private suspend fun saveToDownloadsFolder(sourceFilePath: String, fileName: String): String =
    withContext(Dispatchers.IO) {
      val sourceFile = File(sourceFilePath)
      if (!sourceFile.exists() || !sourceFile.canRead()) {
        throw IOException("源文件不存在或无法读取: $sourceFilePath")
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // Android 10+ 使用 MediaStore API
        val contentValues = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, fileName)
          put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }

        val resolver = activity.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
          ?: throw IOException("无法创建下载文件")

        try {
          resolver.openOutputStream(uri)?.use { outputStream ->
            sourceFile.inputStream().use { inputStream ->
              inputStream.copyTo(outputStream)
            }
          } ?: throw IOException("无法打开输出流")

          // 标记文件已完成
          contentValues.clear()
          contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
          resolver.update(uri, contentValues, null, null)

          // 返回文件路径（通过查询获取）
          val projection = arrayOf(MediaStore.Downloads.DATA)
          resolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
              val columnIndex = cursor.getColumnIndex(MediaStore.Downloads.DATA)
              if (columnIndex >= 0) {
                return@withContext cursor.getString(columnIndex)
                  ?: uri.toString()
              }
            }
          }
          return@withContext uri.toString()
        } catch (e: Exception) {
          // 失败时删除文件
          resolver.delete(uri, null, null)
          throw e
        }
      } else {
        // Android 9 及以下使用传统方式
        val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!downloadsDir.exists()) {
          downloadsDir.mkdirs()
        }

        val destFile = File(downloadsDir, fileName)
        sourceFile.copyTo(destFile, overwrite = true)

        // 通知媒体扫描器
        val intent = Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
        intent.data = Uri.fromFile(destFile)
        activity.sendBroadcast(intent)

        return@withContext destFile.absolutePath
      }
    }
}
