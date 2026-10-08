package com.novacolony.game;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The game sizes its whole UI to the screen. Android's system font size would otherwise also zoom every
        // label in the WebView (textZoom follows the accessibility font scale), so the HUD and panels overflow
        // at large font settings. Pin it like most games do.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) webView.getSettings().setTextZoom(100);
    }
}
