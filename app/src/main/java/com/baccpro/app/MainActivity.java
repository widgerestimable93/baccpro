package com.baccpro.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private static final String APP_URL =
        "https://widgerestimable93.github.io/baccpro/";
    private static final String API_URL =
        "https://script.google.com/macros/s/AKfycbx5zUzECFFW5C44juCU2d0-PtO_XL8Fz7WuXBFzijL10NwN5shuxAn6rdumWsFspSQpMQ/exec";
    private static final String GOOGLE_PENDING_KEY = "bp_google_oauth_pending";

    private WebView webView;
    private ProgressBar progressBar;
    private Uri pendingGoogleCallback;
    private boolean appPageReady;
    private boolean googleAuthBusy;
    private final ExecutorService authExecutor = Executors.newSingleThreadExecutor();

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        applyImmersiveMode();

        RelativeLayout layout = new RelativeLayout(this);
        layout.setBackgroundColor(0xFF0A1628);

        progressBar = new ProgressBar(
            this,
            null,
            android.R.attr.progressBarStyleHorizontal
        );
        progressBar.setMax(100);
        RelativeLayout.LayoutParams pbParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            8
        );
        pbParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        layout.addView(progressBar, pbParams);

        webView = new WebView(this);
        RelativeLayout.LayoutParams wvParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        );
        layout.addView(webView, wvParams);

        setContentView(layout);
        setupWebView();
        pendingGoogleCallback = getIntent() == null ? null : getIntent().getData();
        webView.loadUrl(APP_URL);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " baccPROApp/1.0");
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                WebView view,
                WebResourceRequest request
            ) {
                Uri uri = request.getUrl();
                String host = uri.getHost();

                // Google OAuth must run in the user's external browser, never in this WebView.
                if ("accounts.google.com".equalsIgnoreCase(host)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException e) {
                        notifyGoogleAuthFailure("Aucun navigateur n’est disponible pour la connexion Google.");
                    }
                    return true;
                }

                boolean isAppHost = "widgerestimable93.github.io".equalsIgnoreCase(host)
                    || "script.google.com".equalsIgnoreCase(host)
                    || (host != null && ("google.com".equalsIgnoreCase(host)
                        || host.toLowerCase().endsWith(".google.com")));

                if (!isAppHost) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                Uri page = Uri.parse(url);
                if ("widgerestimable93.github.io".equalsIgnoreCase(page.getHost())) {
                    appPageReady = true;
                    processPendingGoogleCallback();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setVisibility(progress < 100 ? View.VISIBLE : View.GONE);
                progressBar.setProgress(progress);
            }
        });
    }

    private void processPendingGoogleCallback() {
        if (!appPageReady || googleAuthBusy || pendingGoogleCallback == null || webView == null) return;
        final Uri callback = pendingGoogleCallback;
        pendingGoogleCallback = null;

        if (!"baccpro".equalsIgnoreCase(callback.getScheme())
            || !"oauth".equalsIgnoreCase(callback.getHost())
            || !"/callback".equals(callback.getPath())) {
            return;
        }

        final String ticket = callback.getQueryParameter("ticket");
        final String state = callback.getQueryParameter("state");
        if (ticket == null || !ticket.matches("[a-f0-9]{64}")
            || state == null || !state.matches("[A-Za-z0-9_-]{43}")) {
            notifyGoogleAuthFailure("Le retour de connexion Google est invalide. Recommence.");
            return;
        }

        googleAuthBusy = true;
        String script = "(function(){try{" +
            "var p=JSON.parse(localStorage.getItem('" + GOOGLE_PENDING_KEY + "')||'null');" +
            "localStorage.removeItem('" + GOOGLE_PENDING_KEY + "');" +
            "return p?JSON.stringify(p):'';" +
            "}catch(e){return '';}})()";
        webView.evaluateJavascript(script, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String encodedValue) {
                try {
                    Object decoded = new JSONTokener(encodedValue).nextValue();
                    if (!(decoded instanceof String) || ((String) decoded).isEmpty()) {
                        notifyGoogleAuthFailure("Recommence la connexion Google depuis baccPRO.");
                        return;
                    }
                    JSONObject pending = new JSONObject((String) decoded);
                    String expectedState = pending.optString("state", "");
                    String verifier = pending.optString("verifier", "");
                    long expiresAt = pending.optLong("expiresAt", 0L);
                    if (!state.equals(expectedState)
                        || !verifier.matches("[A-Za-z0-9_-]{43,128}")
                        || expiresAt < System.currentTimeMillis()) {
                        notifyGoogleAuthFailure("La vérification de sécurité a expiré. Recommence la connexion Google.");
                        return;
                    }
                    redeemGoogleTicket(ticket, verifier);
                } catch (Exception e) {
                    notifyGoogleAuthFailure("Impossible de vérifier le retour Google. Recommence.");
                }
            }
        });
    }

    private void redeemGoogleTicket(final String ticket, final String verifier) {
        authExecutor.execute(new Runnable() {
            @Override
            public void run() {
                JSONObject result;
                try {
                    JSONObject body = new JSONObject();
                    JSONArray args = new JSONArray();
                    args.put(ticket);
                    args.put(verifier);
                    body.put("fn", "googleAuthRedeem");
                    body.put("args", args);

                    HttpURLConnection connection = (HttpURLConnection)
                        new URL(API_URL).openConnection();
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(25000);
                    connection.setInstanceFollowRedirects(false);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    byte[] requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    connection.setFixedLengthStreamingMode(requestBytes.length);
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(requestBytes);
                    }

                    int status = connection.getResponseCode();
                    String responseText;
                    if (status >= 300 && status < 400) {
                        String redirect = connection.getHeaderField("Location");
                        connection.disconnect();
                        if (redirect == null || redirect.isEmpty()) {
                            throw new IOException("Missing Apps Script response location");
                        }
                        URL redirectUrl = new URL(new URL(API_URL), redirect);
                        String redirectHost = redirectUrl.getHost();
                        if (!"https".equalsIgnoreCase(redirectUrl.getProtocol())
                            || redirectHost == null
                            || !("script.googleusercontent.com".equalsIgnoreCase(redirectHost)
                                || redirectHost.toLowerCase().endsWith(".script.googleusercontent.com"))) {
                            throw new IOException("Unexpected Apps Script response host");
                        }
                        HttpURLConnection redirected = (HttpURLConnection) redirectUrl.openConnection();
                        redirected.setRequestMethod("GET");
                        redirected.setConnectTimeout(20000);
                        redirected.setReadTimeout(25000);
                        int redirectedStatus = redirected.getResponseCode();
                        InputStream redirectedStream = redirectedStatus >= 200 && redirectedStatus < 300
                            ? redirected.getInputStream() : redirected.getErrorStream();
                        responseText = readResponse(redirectedStream);
                        redirected.disconnect();
                        if (redirectedStatus < 200 || redirectedStatus >= 300) {
                            throw new IOException("Apps Script response failed");
                        }
                    } else {
                        InputStream responseStream = status >= 200 && status < 300
                            ? connection.getInputStream() : connection.getErrorStream();
                        responseText = readResponse(responseStream);
                        connection.disconnect();
                        if (status < 200 || status >= 300) {
                            throw new IOException("Apps Script response failed");
                        }
                    }
                    result = new JSONObject(responseText);
                } catch (Exception e) {
                    result = new JSONObject();
                    try {
                        result.put("success", false);
                        result.put("message", "Erreur réseau. Vérifie ta connexion puis recommence.");
                    } catch (JSONException ignored) {}
                }

                final JSONObject finalResult = result;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        googleAuthBusy = false;
                        String serialized = JSONObject.quote(finalResult.toString());
                        webView.evaluateJavascript(
                            "if(window.BaccproGoogleAuth){window.BaccproGoogleAuth.complete(JSON.parse(" +
                                serialized + "));}",
                            null
                        );
                    }
                });
            }
        });
    }

    private String readResponse(InputStream stream) throws IOException {
        if (stream == null) return "{}";
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
        }
        return text.toString();
    }

    private void notifyGoogleAuthFailure(final String message) {
        googleAuthBusy = false;
        if (webView == null) return;
        final String safeMessage = JSONObject.quote(message);
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    webView.evaluateJavascript(
                        "if(window.BaccproGoogleAuth){window.BaccproGoogleAuth.fail(" + safeMessage + ");}",
                        null
                    );
                }
            }
        });
    }

    private void applyImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getData() != null) {
            pendingGoogleCallback = intent.getData();
            processPendingGoogleCallback();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    @Override
    protected void onDestroy() {
        authExecutor.shutdownNow();
        super.onDestroy();
    }
}

