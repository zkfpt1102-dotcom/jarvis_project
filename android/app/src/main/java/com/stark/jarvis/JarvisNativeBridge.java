package com.stark.jarvis;

import android.Manifest;
import android.content.Intent;
import android.content.Context;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.CallLog;
import android.provider.ContactsContract;
import android.provider.Telephony;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.telephony.SmsManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.provider.MediaStore;
import android.app.SearchManager;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "JarvisNativeBridge",
    permissions = {
        @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "audio"),
        @Permission(strings = {Manifest.permission.READ_CALL_LOG, Manifest.permission.CALL_PHONE}, alias = "calls"),
        @Permission(strings = {Manifest.permission.READ_SMS, Manifest.permission.SEND_SMS}, alias = "sms"),
        @Permission(strings = {Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_MEDIA_AUDIO}, alias = "storage"),
        @Permission(strings = {Manifest.permission.READ_CONTACTS}, alias = "contacts")
    }
)
public class JarvisNativeBridge extends Plugin {

    private TextToSpeech tts;
    private boolean isTtsReady = false;
    private SpeechRecognizer speechRecognizer;
    private Intent speechIntent;
    private boolean isListening = false;
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean isMusicPlaybackActive = false;

    @Override
    public void load() {
        super.load();

        // 1. Init Native TextToSpeech
        initTts(null, null);

        // 2. Init Native SpeechRecognizer
        mainHandler.post(this::setupSpeechRecognizer);
    }

    private void initTts(Runnable onReady, Runnable onError) {
        try {
            tts = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS && tts != null) {
                    int result = tts.setLanguage(Locale.KOREAN);
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        result = tts.setLanguage(Locale.KOREA);
                    }
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        result = tts.setLanguage(new Locale("ko", "KR"));
                    }
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(Locale.getDefault());
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                        tts.setAudioAttributes(audioAttributes);
                    }

                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            android.util.Log.d("JarvisBridge", "TTS onStart: " + utteranceId);
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            android.util.Log.d("JarvisBridge", "TTS onDone: " + utteranceId);
                            if (isMusicPlaybackActive) {
                                mainHandler.postDelayed(() -> sendSamsungPlayIntents(), 200);
                            }
                        }

                        @Override
                        public void onError(String utteranceId) {
                            android.util.Log.w("JarvisBridge", "TTS onError: " + utteranceId);
                            if (isMusicPlaybackActive) {
                                mainHandler.postDelayed(() -> sendSamsungPlayIntents(), 200);
                            }
                        }
                    });

                    tts.setPitch(1.0f);
                    tts.setSpeechRate(1.0f);
                    isTtsReady = true;
                    android.util.Log.i("JarvisBridge", "Native Korean TTS initialized successfully.");
                    if (onReady != null) {
                        mainHandler.post(onReady);
                    }
                } else {
                    isTtsReady = false;
                    android.util.Log.w("JarvisBridge", "TTS init failed with status: " + status);
                    if (onError != null) {
                        mainHandler.post(onError);
                    }
                }
            });
        } catch (Exception e) {
            android.util.Log.w("JarvisBridge", "TTS init exception: " + e.getMessage());
            if (onError != null) {
                mainHandler.post(onError);
            }
        }
    }

    private void setupSpeechRecognizer() {
        try {
            if (SpeechRecognizer.isRecognitionAvailable(getContext())) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR");
                speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ko-KR");
                speechIntent.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, "ko-KR");
                speechIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);

                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        JSObject data = new JSObject();
                        data.put("status", "ready");
                        notifyListeners("onSpeechStatus", data);
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        JSObject data = new JSObject();
                        data.put("status", "listening");
                        notifyListeners("onSpeechStatus", data);
                    }

                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        JSObject data = new JSObject();
                        data.put("status", "end");
                        notifyListeners("onSpeechStatus", data);
                    }

                    @Override
                    public void onError(int error) {
                        isListening = false;
                        JSObject data = new JSObject();
                        data.put("error", error);
                        notifyListeners("onSpeechError", data);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        isListening = false;
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            String text = matches.get(0);
                            JSObject data = new JSObject();
                            data.put("text", text);
                            data.put("isFinal", true);
                            notifyListeners("onSpeechResult", data);
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            String text = matches.get(0);
                            JSObject data = new JSObject();
                            data.put("text", text);
                            data.put("isFinal", false);
                            notifyListeners("onSpeechResult", data);
                        }
                    }

                    @Override public void onEvent(int eventType, Bundle params) {}
                });
                android.util.Log.i("JarvisBridge", "Native SpeechRecognizer initialized successfully.");
            }
        } catch (Exception e) {
            android.util.Log.e("JarvisBridge", "SpeechRecognizer setup error: " + e.getMessage());
        }
    }

    // --- Speech Recognition Plugin Methods ---
    @PluginMethod
    public void startListening(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (speechRecognizer == null) {
                    setupSpeechRecognizer();
                }
                if (speechRecognizer != null) {
                    isListening = true;
                    speechRecognizer.startListening(speechIntent);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                } else {
                    call.reject("SpeechRecognizer not available");
                }
            } catch (Exception e) {
                call.reject("startListening failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (speechRecognizer != null) {
                    isListening = false;
                    speechRecognizer.stopListening();
                }
                call.resolve();
            } catch (Exception e) {
                call.resolve();
            }
        });
    }

    // --- Native TextToSpeech Plugin Methods ---
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
            return;
        }

        mainHandler.post(() -> {
            try {
                if (tts == null || !isTtsReady) {
                    initTts(
                        () -> executeSpeak(text, call),
                        () -> {
                            JSObject ret = new JSObject();
                            ret.put("success", false);
                            ret.put("error", "TTS init failure");
                            call.resolve(ret);
                        }
                    );
                } else {
                    executeSpeak(text, call);
                }
            } catch (Exception e) {
                android.util.Log.e("JarvisBridge", "Speak exception: " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    private void executeSpeak(String text, PluginCall call) {
        try {
            if (tts != null) {
                tts.stop();
                Bundle params = new Bundle();
                params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_NOTIFICATION);
                String utteranceId = "jarvis_voice_" + System.currentTimeMillis();
                int res = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
                android.util.Log.i("JarvisBridge", "TTS speak called, result code: " + res);
                JSObject ret = new JSObject();
                ret.put("success", res == TextToSpeech.SUCCESS);
                call.resolve(ret);
            } else {
                JSObject ret = new JSObject();
                ret.put("success", false);
                call.resolve(ret);
            }
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopSpeech(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (tts != null) {
                    tts.stop();
                }
            } catch (Exception ignored) {}
            call.resolve();
        });
    }

    // --- Storage Overview & Largest Files ---
    @PluginMethod
    public void getStorageOverview(PluginCall call) {
        try {
            File path = Environment.getExternalStorageDirectory();
            StatFs stat = new StatFs(path.getPath());
            long blockSize = stat.getBlockSizeLong();
            long totalBlocks = stat.getBlockCountLong();
            long availableBlocks = stat.getAvailableBlocksLong();

            long totalBytes = totalBlocks * blockSize;
            long freeBytes = availableBlocks * blockSize;
            long usedBytes = totalBytes - freeBytes;

            JSObject ret = new JSObject();
            ret.put("totalGB", String.format(Locale.US, "%.2f GB", (double) totalBytes / (1024 * 1024 * 1024)));
            ret.put("usedGB", String.format(Locale.US, "%.2f GB", (double) usedBytes / (1024 * 1024 * 1024)));
            ret.put("freeGB", String.format(Locale.US, "%.2f GB", (double) freeBytes / (1024 * 1024 * 1024)));
            ret.put("percentUsed", (int) (((double) usedBytes / (double) totalBytes) * 100));

            List<FileItem> fileList = new ArrayList<>();
            scanLargestFiles(new File(path, "Download"), fileList, 0);
            scanLargestFiles(new File(path, "DCIM"), fileList, 0);
            scanLargestFiles(new File(path, "Documents"), fileList, 0);

            Collections.sort(fileList, (a, b) -> Long.compare(b.size, a.size));

            JSArray largest = new JSArray();
            int limit = Math.min(fileList.size(), 10);
            for (int i = 0; i < limit; i++) {
                FileItem fi = fileList.get(i);
                JSObject item = new JSObject();
                item.put("name", fi.name);
                item.put("path", fi.path);
                item.put("sizeMB", String.format(Locale.US, "%.1f MB", (double) fi.size / (1024 * 1024)));
                largest.put(item);
            }
            ret.put("largestFiles", largest);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to inspect storage: " + e.getMessage());
        }
    }

    private static class FileItem {
        String name;
        String path;
        long size;
        FileItem(String n, String p, long s) { name = n; path = p; size = s; }
    }

    private void scanLargestFiles(File dir, List<FileItem> list, int depth) {
        if (dir == null || !dir.exists() || !dir.canRead() || depth > 4) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory() && !f.getName().startsWith(".")) {
                scanLargestFiles(f, list, depth + 1);
            } else if (f.isFile() && f.length() > 5 * 1024 * 1024) {
                list.add(new FileItem(f.getName(), f.getAbsolutePath(), f.length()));
            }
        }
    }

    // --- Missed Calls ---
    @PluginMethod
    public void getMissedCalls(PluginCall call) {
        try {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("reason", "READ_CALL_LOG permission not granted");
                call.resolve(ret);
                return;
            }

            JSArray missedList = new JSArray();
            String[] projection = new String[] {
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.NUMBER,
                CallLog.Calls.DATE,
                CallLog.Calls.TYPE
            };

            String selection = CallLog.Calls.TYPE + " = " + CallLog.Calls.MISSED_TYPE;
            String sortOrder = CallLog.Calls.DATE + " DESC LIMIT 10";

            Cursor cursor = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            );

            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.KOREA);

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String name = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME));
                    String number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER));
                    long dateLong = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE));

                    JSObject item = new JSObject();
                    item.put("caller", (name != null && !name.isEmpty()) ? name : "알 수 없음");
                    item.put("number", number != null ? number : "");
                    item.put("time", sdf.format(new Date(dateLong)));
                    missedList.put(item);
                }
                cursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("count", missedList.length());
            ret.put("calls", missedList);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to query missed calls: " + e.getMessage());
        }
    }

    // --- Contact Helper ---
    private static class ContactInfo {
        String name;
        String number;
        ContactInfo(String name, String number) { this.name = name; this.number = number; }
    }

    private ContactInfo findContactByName(String query) {
        if (query == null || query.trim().isEmpty()) return null;
        String clean = query.trim();
        // 1. Remove conversational prefixes and particles with whitespace guard
        clean = clean.replaceAll("^(?:어|야|헤이|하이|오케이|응|아니|아)\\s+(?:자비스|자비슨|자비스야|자비스님)?\\s*", "")
                     .replaceAll("^(?:자비스|자비슨|자비스야|자비스님)\\s*", "")
                     .replaceAll("(?:에게|한테|로)$", "")
                     .replaceAll("(?:전화|통화)\\s*(?:걸어\\s*달라니까|걸어\\s*달라고|걸어\\s*달라|걸어\\s*줘|걸어\\s*봐|걸어|해\\s*달라니까|해\\s*달라고|해\\s*달라|해\\s*줘|해|연결\\s*해줘|연결|발신\\s*해줘|발신)\\s*$", "")
                     .replaceAll("(?:^|\\s+)(?:좀|한번|빨리|지금|얼른|줘|라니까|니까|라고|했잖아)\\s*$", "")
                     .trim();

        if (clean.isEmpty()) return null;

        // If it's already a direct phone number
        if (clean.replaceAll("[^0-9]", "").length() >= 7) {
            String digits = clean.replaceAll("[^0-9]", "");
            return new ContactInfo(clean, digits);
        }

        try {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                return null;
            }

            android.content.ContentResolver cr = getContext().getContentResolver();
            Uri uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI;
            String[] projection = new String[] {
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            };
            String selection = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?";
            String[] selectionArgs = new String[] { "%" + clean + "%" };

            try (Cursor cursor = cr.query(uri, projection, selection, selectionArgs, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    String name = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME));
                    String number = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER));
                    return new ContactInfo(name, number);
                }
            }

            // Fallback: check without spaces (e.g. "김 수 현" -> "김수현")
            String noSpace = clean.replaceAll("\\s+", "");
            if (!noSpace.equals(clean)) {
                String[] argsNoSpace = new String[] { "%" + noSpace + "%" };
                try (Cursor cursor = cr.query(uri, projection, selection, argsNoSpace, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        String name = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME));
                        String number = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER));
                        return new ContactInfo(name, number);
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("JarvisBridge", "findContactByName error: " + e.getMessage());
        }
        return null;
    }

    @PluginMethod
    public void searchContact(PluginCall call) {
        String name = call.getString("name");
        ContactInfo info = findContactByName(name);
        JSObject ret = new JSObject();
        if (info != null) {
            ret.put("found", true);
            ret.put("name", info.name);
            ret.put("number", info.number);
        } else {
            ret.put("found", false);
            ret.put("name", name);
        }
        call.resolve(ret);
    }

    // --- Phone Call ---
    @PluginMethod
    public void makePhoneCall(PluginCall call) {
        String input = call.getString("number");
        if (input == null || input.isEmpty()) {
            call.reject("Phone number or contact name required");
            return;
        }

        ContactInfo contact = findContactByName(input);
        String finalNumber = (contact != null) ? contact.number : input;
        String contactName = (contact != null) ? contact.name : input;
        String cleanDigits = finalNumber.replaceAll("[^0-9+*#]", "");

        // CRITICAL FIX: Block invalid calls when name is not found in contacts
        if (cleanDigits.length() < 7) {
            android.util.Log.w("JarvisBridge", "makePhoneCall blocked invalid target: " + input);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "연락처를 찾을 수 없습니다: " + input);
            ret.put("name", contactName);
            call.resolve(ret);
            return;
        }

        try {
            Intent intent;
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
                intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + cleanDigits));
            } else {
                intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + cleanDigits));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("calling", cleanDigits);
            ret.put("name", contactName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to place call: " + e.getMessage());
        }
    }

    // --- Send SMS ---
    @PluginMethod
    public void sendSms(PluginCall call) {
        String input = call.getString("number");
        String message = call.getString("message");

        if (input == null || message == null) {
            call.reject("Number/Name and message required");
            return;
        }

        ContactInfo contact = findContactByName(input);
        String finalNumber = (contact != null) ? contact.number : input;
        String contactName = (contact != null) ? contact.name : input;
        String cleanDigits = finalNumber.replaceAll("[^0-9+*#]", "");

        try {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("sms:" + cleanDigits));
                intent.putExtra("sms_body", message);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("mode", "intent");
                ret.put("number", cleanDigits);
                ret.put("name", contactName);
                call.resolve(ret);
                return;
            }

            SmsManager smsManager = SmsManager.getDefault();
            smsManager.sendTextMessage(cleanDigits, null, message, null, null);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("mode", "direct");
            ret.put("number", cleanDigits);
            ret.put("name", contactName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to send SMS: " + e.getMessage());
        }
    }

    // --- Device Volume Adjustment ---
    @PluginMethod
    public void adjustDeviceVolume(PluginCall call) {
        String direction = call.getString("direction", "down");
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
            if (am != null) {
                if ("up".equalsIgnoreCase(direction)) {
                    am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
                } else if ("down".equalsIgnoreCase(direction)) {
                    am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                } else if ("mute".equalsIgnoreCase(direction)) {
                    am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI);
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("direction", direction);
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            android.util.Log.w("JarvisBridge", "adjustDeviceVolume error: " + e.getMessage());
        }
        JSObject ret = new JSObject();
        ret.put("success", false);
        call.resolve(ret);
    }

    // --- Open External App ---
    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("package", "com.kakao.talk");
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(pkg);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("package", pkg);
                call.resolve(ret);
            } else {
                call.reject("App not installed: " + pkg);
            }
        } catch (Exception e) {
            call.reject("Failed to launch app: " + e.getMessage());
        }
    }

    // --- Media / Multi-Platform Playback (Samsung Music, YouTube, YouTube Music) ---
    @PluginMethod
    public void playMusic(PluginCall call) {
        String query = call.getString("query", "");
        String platform = call.getString("platform", "auto");
        if (platform == null || platform.trim().isEmpty()) {
            platform = "auto";
        }
        platform = platform.trim().toLowerCase();

        android.util.Log.i("JarvisBridge", "playMusic requested - platform: " + platform + ", query: " + query);
        PackageManager pm = getContext().getPackageManager();
        String cleanQ = (query != null) ? query.trim() : "";

        try {
            // 1. Explicit YouTube Request
            if ("youtube".equals(platform)) {
                openYouTube(cleanQ, call);
                return;
            }

            // 2. Explicit YouTube Music Request
            if ("youtube_music".equals(platform) || "ytmusic".equals(platform)) {
                openYouTubeMusic(cleanQ, call);
                return;
            }

            // 3. Playlist Playback Request
            if ("samsung_playlist".equals(platform) || "playlist".equals(platform)) {
                openSamsungPlaylist(cleanQ, call);
                return;
            }

            // 4. Explicit Samsung Music Request
            if ("samsung".equals(platform)) {
                openSamsungMusic(cleanQ, call);
                return;
            }

            // 5. Auto Mode (prioritize Samsung Music playback over YouTube Music)
            if (isPackageInstalled("com.sec.android.app.music", pm)) {
                openSamsungMusic(cleanQ, call);
                return;
            }
            if (!cleanQ.isEmpty()) {
                if (isPackageInstalled("com.google.android.apps.youtube.music", pm)) {
                    openYouTubeMusic(cleanQ, call);
                    return;
                }
                openYouTube(cleanQ, call);
                return;
            }

            // 7. Fallback
            openSamsungMusic("", call);

        } catch (Exception e) {
            android.util.Log.e("JarvisBridge", "playMusic error: " + e.getMessage(), e);
            call.reject("playMusic error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkSongExists(PluginCall call) {
        String query = call.getString("query", "");
        String cleanQ = (query != null) ? query.trim() : "";
        android.util.Log.i("JarvisBridge", "checkSongExists requested for: " + cleanQ);

        JSObject localSong = findLocalSong(cleanQ);
        JSObject ret = new JSObject();
        if (localSong != null) {
            ret.put("exists", true);
            ret.put("title", localSong.getString("title"));
            ret.put("uri", localSong.getString("uri"));
        } else {
            ret.put("exists", false);
            ret.put("title", cleanQ);
        }
        call.resolve(ret);
    }

    private String sanitizeSongQuery(String raw) {
        if (raw == null) return "";
        String clean = raw.replaceAll("^(?:어|야|헤이|하이|오케이|응)\\s+(?:자비스|자비슨|자비스야|자비스님)?\\s*", "")
                          .replaceAll("^(?:자비스|자비슨|자비스야|자비스님)\\s*", "")
                          .replaceAll("(?i)(?:삼성\\s*뮤직|삼성음악|유튜브\\s*뮤직|유투브\\s*뮤직|유튜브|유투브|내\\s*폰|스마트폰|핸드폰|폰|기기|저장소)(?:으로|로|에서|에)?\\s*", "")
                          .replaceAll("(?i)(?:플레이리스트|플리)\\s*(?:목록\\s*)?(?:안에\\s*있는|안의|안에|에서|에\\s*있는|에|의)?\\s*", "")
                          .replaceAll("(?:다운로드\\s*된|다운\\s*받은|다운\\s*된|저장\\s*된|들어\\s*있는|저장되어\\s*있는|다운되어\\s*있는|있는)\\s*(?:노래|음악|곡|음원|파일)?\\s*(?:중에서|중에|중)?\\s*", "")
                          .replaceAll("(?:노래|음악|곡|음원|파일)\\s*(?:중에서|중에|중)\\s*", "")
                          .replaceAll("(?:틀어\\s*달라그러면|틀어\\s*달라고|틀어\\s*달라|틀어\\s*줄래|틀어\\s*줘봐|틀어\\s*줘|틀어\\s*봐|틀어|재생\\s*해줄래|재생\\s*해줘|재생\\s*해|재생|켜\\s*줄래|켜\\s*줘|켜|실행\\s*해줄래|실행\\s*해줘|실행|검색\\s*해줘|검색|찾아\\s*줄래|찾아\\s*줘|찾아\\s*봐|찾아|들려\\s*줄래|들려\\s*줘|보여\\s*줘|확인\\s*해줘|있어\\??|있니\\??|있나\\??|있음\\??|들어있어\\??)", "")
                          .replaceAll("(?:^|\\s+)(?:좀|한번|저기|혹시|얼른)(?:\\s+|$)", " ")
                          .replaceAll("(?:이란|이라는|라는|란|의)?\\s*(?:노래|음악|곡|음원|파일)(?:을|를)?\\s*$", "")
                          .replaceAll("(?:을|를)\\s*$", "")
                          .trim();
        if (clean.matches("^(?:곡|노래|음악|파일|음원|것)$")) return "";
        return clean;
    }

    private JSObject getAnyLocalSong() {
        try {
            android.content.ContentResolver cr = getContext().getContentResolver();
            Uri audioUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST
            };

            // 1st attempt: IS_MUSIC != 0
            try (Cursor cursor = cr.query(audioUri, projection, MediaStore.Audio.Media.IS_MUSIC + " != 0", null, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                if (cursor != null && cursor.moveToFirst()) {
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                    String foundTitle = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE));
                    Uri songUri = ContentUris.withAppendedId(audioUri, id);
                    android.util.Log.i("JarvisBridge", "getAnyLocalSong found: " + foundTitle + " (" + songUri + ")");
                    JSObject res = new JSObject();
                    res.put("uri", songUri.toString());
                    res.put("title", foundTitle);
                    return res;
                }
            }

            // 2nd attempt: any audio file
            try (Cursor cursor = cr.query(audioUri, projection, null, null, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                if (cursor != null && cursor.moveToFirst()) {
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                    String foundTitle = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE));
                    Uri songUri = ContentUris.withAppendedId(audioUri, id);
                    android.util.Log.i("JarvisBridge", "getAnyLocalSong fallback found: " + foundTitle + " (" + songUri + ")");
                    JSObject res = new JSObject();
                    res.put("uri", songUri.toString());
                    res.put("title", foundTitle);
                    return res;
                }
            }
        } catch (Exception e) {
            android.util.Log.w("JarvisBridge", "getAnyLocalSong exception: " + e.getMessage());
        }
        return null;
    }

    private void triggerSamsungMusicPlayback() {
        isMusicPlaybackActive = true;
        sendSamsungPlayIntents();
        mainHandler.postDelayed(this::sendSamsungPlayIntents, 500);
        mainHandler.postDelayed(this::sendSamsungPlayIntents, 1200);
    }

    private void sendSamsungPlayIntents() {
        try {
            Intent cmd = new Intent("com.sec.android.app.music.musicservicecommand.play");
            cmd.setPackage("com.sec.android.app.music");
            getContext().sendBroadcast(cmd);
        } catch (Exception ignored) {}

        try {
            Intent cmd2 = new Intent("com.sec.android.app.music.musicservicecommand");
            cmd2.putExtra("command", "play");
            cmd2.setPackage("com.sec.android.app.music");
            getContext().sendBroadcast(cmd2);
        } catch (Exception ignored) {}

        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                long now = SystemClock.uptimeMillis();
                KeyEvent down = new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY, 0);
                KeyEvent up = new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY, 0);
                am.dispatchMediaKeyEvent(down);
                am.dispatchMediaKeyEvent(up);
            }
        } catch (Exception ignored) {}
    }

    private boolean startSamsungMusicPlaybackWithUri(Uri songUri) {
        try {
            Intent playIntent = new Intent(Intent.ACTION_VIEW);
            playIntent.setDataAndType(songUri, "audio/*");
            playIntent.setComponent(new android.content.ComponentName("com.sec.android.app.music", "com.samsung.android.app.music.activity.SoundPlayerActivity"));
            playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            getContext().startActivity(playIntent);
            triggerSamsungMusicPlayback();
            return true;
        } catch (Exception e) {
            android.util.Log.w("JarvisBridge", "SoundPlayerActivity direct failed: " + e.getMessage());
            try {
                PackageManager pm = getContext().getPackageManager();
                Intent playIntent = new Intent(Intent.ACTION_VIEW);
                playIntent.setDataAndType(songUri, "audio/*");
                playIntent.setPackage("com.sec.android.app.music");
                playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (playIntent.resolveActivity(pm) != null) {
                    getContext().startActivity(playIntent);
                    triggerSamsungMusicPlayback();
                    return true;
                }
            } catch (Exception ex) {
                android.util.Log.w("JarvisBridge", "startSamsungMusicPlaybackWithUri failed: " + ex.getMessage());
            }
        }
        return false;
    }

    private JSObject findLocalSong(String rawQuery) {
        String cleanQ = sanitizeSongQuery(rawQuery);
        if (cleanQ == null || cleanQ.trim().isEmpty()) return null;
        cleanQ = cleanQ.trim();

        try {
            android.content.ContentResolver cr = getContext().getContentResolver();
            Uri audioUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.ARTIST
            };

            // 1. Exact / Substring match
            String selection = "(" + MediaStore.Audio.Media.TITLE + " LIKE ? OR " +
                              MediaStore.Audio.Media.DISPLAY_NAME + " LIKE ? OR " +
                              MediaStore.Audio.Media.ARTIST + " LIKE ?)";
            String[] selectionArgs = new String[] { "%" + cleanQ + "%", "%" + cleanQ + "%", "%" + cleanQ + "%" };

            try (Cursor cursor = cr.query(audioUri, projection, selection, selectionArgs, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                if (cursor != null && cursor.moveToFirst()) {
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                    String foundTitle = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE));
                    Uri songUri = ContentUris.withAppendedId(audioUri, id);
                    android.util.Log.i("JarvisBridge", "Found local song: " + foundTitle + " (" + songUri + ")");

                    JSObject res = new JSObject();
                    res.put("uri", songUri.toString());
                    res.put("title", foundTitle);
                    return res;
                }
            }

            // 2. No-space match
            if (cleanQ.contains(" ")) {
                String noSpace = cleanQ.replace(" ", "");
                String[] noSpaceArgs = new String[] { "%" + noSpace + "%", "%" + noSpace + "%", "%" + noSpace + "%" };
                try (Cursor cursor = cr.query(audioUri, projection, selection, noSpaceArgs, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                    if (cursor != null && cursor.moveToFirst()) {
                        long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                        String foundTitle = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE));
                        Uri songUri = ContentUris.withAppendedId(audioUri, id);
                        android.util.Log.i("JarvisBridge", "Found local song (no-space): " + foundTitle + " (" + songUri + ")");

                        JSObject res = new JSObject();
                        res.put("uri", songUri.toString());
                        res.put("title", foundTitle);
                        return res;
                    }
                }
            }

            // 3. Multi-token match (longest token first)
            String[] tokens = cleanQ.split("\s+");
            if (tokens.length > 1) {
                java.util.Arrays.sort(tokens, (a, b) -> Integer.compare(b.length(), a.length()));
                for (String token : tokens) {
                    if (token.length() >= 2) {
                        String[] tokenArgs = new String[] { "%" + token + "%", "%" + token + "%", "%" + token + "%" };
                        try (Cursor cursor = cr.query(audioUri, projection, selection, tokenArgs, MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
                            if (cursor != null && cursor.moveToFirst()) {
                                long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID));
                                String foundTitle = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE));
                                Uri songUri = ContentUris.withAppendedId(audioUri, id);
                                android.util.Log.i("JarvisBridge", "Found local song (token " + token + "): " + foundTitle + " (" + songUri + ")");

                                JSObject res = new JSObject();
                                res.put("uri", songUri.toString());
                                res.put("title", foundTitle);
                                return res;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("JarvisBridge", "findLocalSong exception: " + e.getMessage());
        }
        return null;
    }

    private void openYouTube(String query, PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent ytIntent;
            if (query.isEmpty()) {
                ytIntent = pm.getLaunchIntentForPackage("com.google.android.youtube");
                if (ytIntent == null) {
                    ytIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com"));
                }
            } else {
                String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.name());
                ytIntent = new Intent(Intent.ACTION_SEARCH);
                ytIntent.setPackage("com.google.android.youtube");
                ytIntent.putExtra("query", query);
                ytIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (ytIntent.resolveActivity(pm) == null) {
                    ytIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/results?search_query=" + encoded));
                    ytIntent.setPackage("com.google.android.youtube");
                    ytIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (ytIntent.resolveActivity(pm) == null) {
                        ytIntent.setPackage(null);
                    }
                }
            }
            ytIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ytIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("platform", "youtube");
            ret.put("found", false);
            ret.put("title", query);
            ret.put("mode", "youtube_search");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("YouTube open error: " + e.getMessage());
        }
    }

    private void openYouTubeMusic(String query, PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent ytmIntent;
            if (query.isEmpty()) {
                ytmIntent = pm.getLaunchIntentForPackage("com.google.android.apps.youtube.music");
                if (ytmIntent == null) {
                    ytmIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://music.youtube.com"));
                }
            } else {
                ytmIntent = new Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH);
                ytmIntent.setPackage("com.google.android.apps.youtube.music");
                ytmIntent.putExtra(SearchManager.QUERY, query);
                ytmIntent.putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*");
                ytmIntent.putExtra(MediaStore.EXTRA_MEDIA_TITLE, query);
                ytmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (ytmIntent.resolveActivity(pm) == null) {
                    String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.name());
                    ytmIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://music.youtube.com/search?q=" + encoded));
                }
            }
            ytmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ytmIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("platform", "youtube_music");
            ret.put("found", false);
            ret.put("title", query);
            ret.put("mode", "youtube_music_search");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("YouTube Music open error: " + e.getMessage());
        }
    }

    private void openSamsungPlaylist(String playlistName, PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String cleanName = sanitizeSongQuery(playlistName);
            String target = (!cleanName.isEmpty()) ? cleanName : "드라이브용 2";
            android.util.Log.i("JarvisBridge", "openSamsungPlaylist with MEDIA_PLAY_FROM_SEARCH: " + target);

            Intent playIntent = new Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH);
            playIntent.setPackage("com.sec.android.app.music");
            playIntent.putExtra("android.intent.extra.focus", "vnd.android.cursor.item/playlist");
            playIntent.putExtra(SearchManager.QUERY, target);
            playIntent.putExtra(MediaStore.EXTRA_MEDIA_TITLE, target);
            playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (playIntent.resolveActivity(pm) != null) {
                getContext().startActivity(playIntent);
                triggerSamsungMusicPlayback();

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("platform", "samsung");
                ret.put("found", true);
                ret.put("title", target);
                ret.put("mode", "samsung_playlist_search");
                call.resolve(ret);
                return;
            }
        } catch (Exception e) {
            android.util.Log.e("JarvisBridge", "openSamsungPlaylist error: " + e.getMessage(), e);
        }

        try {
            PackageManager pm = getContext().getPackageManager();
            Intent explicitIntent = pm.getLaunchIntentForPackage("com.sec.android.app.music");
            if (explicitIntent != null) {
                explicitIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(explicitIntent);
                triggerSamsungMusicPlayback();
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("platform", "samsung");
            ret.put("title", "드라이브용 2");
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Samsung playlist playback error: " + ex.getMessage());
        }
    }

    private void openSamsungMusic(String query, PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String cleanQuery = sanitizeSongQuery(query);

            if (!cleanQuery.isEmpty()) {
                android.util.Log.i("JarvisBridge", "openSamsungMusic with MEDIA_PLAY_FROM_SEARCH: " + cleanQuery);
                Intent playIntent = new Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH);
                playIntent.setPackage("com.sec.android.app.music");
                playIntent.putExtra("android.intent.extra.focus", "vnd.android.cursor.item/audio");
                playIntent.putExtra(SearchManager.QUERY, cleanQuery);
                playIntent.putExtra(MediaStore.EXTRA_MEDIA_TITLE, cleanQuery);
                playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (playIntent.resolveActivity(pm) != null) {
                    getContext().startActivity(playIntent);
                    triggerSamsungMusicPlayback();

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("platform", "samsung");
                    ret.put("found", true);
                    ret.put("title", cleanQuery);
                    ret.put("mode", "samsung_music_search");
                    call.resolve(ret);
                    return;
                }
            }

            // Fallback: Play default playlist
            openSamsungPlaylist("드라이브용 2", call);
        } catch (Exception e) {
            android.util.Log.e("JarvisBridge", "openSamsungMusic error: " + e.getMessage(), e);
            call.reject("Samsung Music open error: " + e.getMessage());
        }
    }

    private boolean isPackageInstalled(String packageName, PackageManager pm) {
        try {
            pm.getPackageInfo(packageName, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
