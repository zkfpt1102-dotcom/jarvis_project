package com.stark.jarvis;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JarvisNativeBridge.class);
        super.onCreate(savedInstanceState);
        requestJarvisPermissions();
    }

    private void requestJarvisPermissions() {
        List<String> permList = new ArrayList<>();
        permList.add(Manifest.permission.RECORD_AUDIO);
        permList.add(Manifest.permission.READ_CALL_LOG);
        permList.add(Manifest.permission.CALL_PHONE);
        permList.add(Manifest.permission.READ_SMS);
        permList.add(Manifest.permission.SEND_SMS);
        permList.add(Manifest.permission.READ_CONTACTS);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permList.add(Manifest.permission.READ_MEDIA_AUDIO);
            permList.add(Manifest.permission.READ_MEDIA_VIDEO);
        } else {
            permList.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        List<String> needed = new ArrayList<>();
        for (String p : permList) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), 777);
        }

        // Android 11+ All Files Access
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception ignored) {}
            }
        }
    }
}
