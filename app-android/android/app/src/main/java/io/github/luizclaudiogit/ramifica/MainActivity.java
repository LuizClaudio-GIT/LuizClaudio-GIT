package io.github.luizclaudiogit.ramifica;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.net.URLEncoder;

public class MainActivity extends BridgeActivity {
    private String pending = null;
    private int tries = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    /** Converte o que chegou de fora (Compartilhar ou atalho do ícone) em parâmetros para o app web. */
    private void handle(Intent intent) {
        if (intent == null) return;
        String query = null;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null || title != null) query = "title=" + enc(title) + "&text=" + enc(text);
        } else if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null && "ramifica".equals(data.getScheme()) && data.getHost() != null) query = "acao=" + enc(data.getHost());
        }
        if (query == null) return;
        intent.setAction(Intent.ACTION_MAIN);
        pending = query;
        tries = 0;
        deliver();
    }

    /** Espera o app web ficar pronto e entrega os parâmetros. */
    private void deliver() {
        if (pending == null || getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        wv.postDelayed(() -> wv.evaluateJavascript("typeof window.ramificaLaunch === 'function'", ready -> {
            if ("true".equals(ready) && pending != null) {
                wv.evaluateJavascript("window.ramificaLaunch(" + JSONObject.quote(pending) + ")", null);
                pending = null;
            } else if (tries++ < 40) {
                deliver();
            }
        }), 250);
    }

    private static String enc(String s) {
        if (s == null) return "";
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return ""; }
    }
}
