package com.inventory.manager;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new WebAppBridge(this, webView), "AndroidBridge");
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        // 让页面内的弹层先关闭；否则退出
        webView.evaluateJavascript(
                "(function(){var o=document.querySelector('.sheet-mask:not(.hidden)');" +
                "if(o){o.classList.add('hidden');return true;}return false;})()",
                value -> { if (!"true".equals(value)) super.onBackPressed(); });
    }

    // ============ JS 桥：文件 IO 落到应用私有存储，等价于桌面版本地文件 ============
    public static class WebAppBridge {
        private final Context context;
        private final WebView webView;
        private final Handler mainHandler = new Handler(Looper.getMainLooper());
        private final ActivityResultLauncher<String> pickLauncher;

        public WebAppBridge(MainActivity activity, WebView webView) {
            this.context = activity;
            this.webView = webView;
            this.pickLauncher = activity.registerForActivityResult(
                    new ActivityResultContracts.GetContent(),
                    uri -> {
                        if (uri == null) return;
                        String content = readUri(uri);
                        String name = displayName(uri);
                        try {
                            JSONObject o = new JSONObject();
                            o.put("name", name);
                            o.put("content", content);
                            String js = "window.__onPickFile(" + JSONObject.quote(o.toString()) + ")";
                            webView.evaluateJavascript(js, null);
                        } catch (Exception ignore) {}
                    });
        }

        @JavascriptInterface
        public String readFile(String path) {
            File f = new File(context.getFilesDir(), path);
            if (!f.exists()) return null;
            try { return readAll(f); } catch (Exception e) { return null; }
        }

        @JavascriptInterface
        public boolean writeFile(String path, String content) {
            File f = new File(context.getFilesDir(), path);
            f.getParentFile().mkdirs();
            try { writeAll(f, content); return true; } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String listFiles(String dir) {
            File d = new File(context.getFilesDir(), dir);
            JSONArray arr = new JSONArray();
            if (d.exists() && d.isDirectory()) {
                File[] files = d.listFiles();
                if (files != null) for (File x : files) if (x.isFile()) arr.put(x.getName());
            }
            return arr.toString();
        }

        @JavascriptInterface
        public boolean deleteFile(String path) {
            File f = new File(context.getFilesDir(), path);
            try { return f.delete(); } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean exists(String path) {
            return new File(context.getFilesDir(), path).exists();
        }

        @JavascriptInterface
        public void pickFile() {
            mainHandler.post(() -> pickLauncher.launch("*/*"));
        }

        @JavascriptInterface
        public void shareFile(String relPath) {
            File f = new File(context.getFilesDir(), relPath);
            if (!f.exists()) return;
            mainHandler.post(() -> {
                try {
                    Uri uri = FileProvider.getUriForFile(context,
                            context.getPackageName() + ".fileprovider", f);
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType("text/csv");
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    context.startActivity(Intent.createChooser(intent, "导出 / 分享"));
                } catch (Exception e) {
                    Toast.makeText(context, "分享失败", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            mainHandler.post(() -> Toast.makeText(context, msg, Toast.LENGTH_SHORT).show());
        }

        // ---------- 内部工具 ----------
        private String readAll(File f) throws Exception {
            FileInputStream in = new FileInputStream(f);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        }

        private void writeAll(File f, String content) throws Exception {
            FileOutputStream out = new FileOutputStream(f);
            out.write((content == null ? "" : content).getBytes(StandardCharsets.UTF_8));
            out.close();
        }

        private String readUri(Uri uri) {
            try {
                InputStream is = context.getContentResolver().openInputStream(uri);
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while (is != null && (n = is.read(buf)) > 0) bos.write(buf, 0, n);
                if (is != null) is.close();
                return bos.toString("UTF-8");
            } catch (Exception e) { return ""; }
        }

        private String displayName(Uri uri) {
            String result = "import.csv";
            try {
                android.database.Cursor c = context.getContentResolver()
                        .query(uri, null, null, null, null);
                if (c != null) {
                    int i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                    if (i >= 0 && c.moveToFirst()) result = c.getString(i);
                    c.close();
                }
            } catch (Exception ignore) {}
            return result;
        }
    }
}
