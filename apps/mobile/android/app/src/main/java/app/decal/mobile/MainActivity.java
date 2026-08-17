package app.decal.mobile;

import android.content.SharedPreferences;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.Logger;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    // Must match SERVER_URL_PREFERENCE_KEY in apps/web/lib/nativeServerPreference.ts
    // and PREF_KEY in apps/mobile/www/index.html. Nothing links these three
    // together automatically (this file isn't part of the JS/TS build at all),
    // so — same as every other shared-key constant in this project — it's kept
    // in sync by hand.
    private static final String SERVER_URL_PREF_KEY = "decal_server_url";

    // @capacitor/preferences' Android implementation stores every key in one
    // SharedPreferences file named "CapacitorStorage" unless a caller passes a
    // custom "group" to Preferences.configure() — this app never does, so this
    // is exactly the file prefs.get/set({key: "decal_server_url", ...}) reads
    // and writes (verified against capacitor-plugins' Preferences.java /
    // PreferencesConfiguration.java source, not guessed).
    private static final String PREFERENCES_STORAGE_GROUP = "CapacitorStorage";

    /**
     * Why this override exists — see the big comment block in
     * capacitor.config.ts and apps/mobile/www/index.html for the rest of the
     * runtime-server-URL design this is part of.
     *
     * Decal is self-hosted, so the server address is entered at runtime and
     * the WebView navigates to it via server.allowNavigation rather than a
     * build-time-fixed server.url. That works fine on iOS. On Android it
     * doesn't, because of a real Capacitor core limitation (not a mistake
     * anywhere else in this project — see capacitor.build.gradle,
     * capacitor.settings.gradle, and capacitor.plugins.json, all of which
     * were individually re-verified correct before landing on this fix):
     * Capacitor's Android bridge only injects window.Capacitor — and every
     * native plugin along with it — into ONE origin, "appUrl", which is
     * locked in once at Bridge-construction time (Bridge.java's
     * loadWebView(): WebViewCompat.addDocumentStartJavaScript(webView,
     * script, Collections.singleton(allowedOrigin))). appUrl resolves to
     * either config.getServerUrl() if one is set, or the local bundled
     * www/index.html origin if not — decided before any navigation happens.
     * allowNavigation only controls which origins the WebView is *permitted
     * to load*; it does nothing to extend where the bridge script gets
     * injected. So the instant the app navigates from the local bootstrap
     * page to the real server, every native plugin call from anywhere else
     * in the app — Browser.open (the "Browser plugin is not implemented on
     * android" error), Preferences (Switch server, Log out), the
     * appUrlOpen listener the Google sign-in token handoff depends on — has
     * no bridge to call into. iOS's equivalent mechanism (a WKUserScript
     * added to the WKWebView's own configuration) isn't origin-locked this
     * way, which is exactly why this only ever showed up on Android.
     *
     * The fix: before the bridge is built at all, read whatever server
     * address is already saved in native storage (the same storage the
     * Preferences plugin itself uses — see PREFERENCES_STORAGE_GROUP above)
     * and, if one exists, hand Capacitor a CapConfig with THAT as
     * server.url. Then appUrl resolves to the real server from the very
     * start of the launch, the WebView loads it directly (skipping the
     * local bootstrap page for this launch, the same way a build-time-fixed
     * server.url always has), and the bridge gets injected for that origin
     * — so plugins work everywhere in the app, not just on the bootstrap
     * screen.
     *
     * Caveat: this only takes effect on the NEXT cold start after an
     * address is saved, not the same run that just saved it — this method
     * has already run by the time JS gets around to calling
     * Preferences.set(). First-time server entry and "Switch server" both
     * still navigate the old (Android-broken) way for that one transition.
     * Practically: on Android, fully close and reopen the app once right
     * after entering or changing a server address, before relying on
     * anything native (Google sign-in chief among them) — every launch
     * after that is seamless. This has no effect on iOS at all.
     */
    @Override
    protected void load() {
        try {
            String savedServerUrl = readSavedServerUrl();
            if (savedServerUrl != null && !savedServerUrl.isEmpty()) {
                // "/m" specifically, not just the bare origin — same reason
                // www/index.html's own navigation always appends it: the bare
                // origin serves the desktop kiosk dashboard layout
                // (apps/web/app/page.tsx), not the mobile bottom-tab routes
                // this app is actually built around (apps/web/app/m/).
                // Bridge.java appends config.getStartPath() after
                // config.getServerUrl() verbatim with no separator handling
                // of its own, so it's simplest to just fold it into the one
                // string here rather than also using setStartPath().
                this.config = withServerUrl(CapConfig.loadDefault(this), savedServerUrl + "/m");
            }
        } catch (Exception ex) {
            // Fail open to Capacitor's normal default-config behavior (i.e.
            // the pre-existing, broken-past-the-bootstrap-page-on-Android
            // behavior) rather than crashing the app over this optimization.
            Logger.error("Decal: failed to apply saved server URL to native config", ex);
        }
        super.load();
    }

    private String readSavedServerUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFERENCES_STORAGE_GROUP, MODE_PRIVATE);
        return prefs.getString(SERVER_URL_PREF_KEY, null);
    }

    /**
     * Rebuilds a CapConfig identical to `source` except for serverUrl —
     * CapConfig itself is immutable with no setters once built, so the only
     * way to change one field is to copy every other field into a fresh
     * Builder. The field list here is pinned to @capacitor/android 6.2.1
     * specifically (this project's exact resolved version, per
     * pnpm-lock.yaml — confirmed by fetching CapConfig.java at the 6.2.1 git
     * tag, not just Capacitor's main branch, after main's extra
     * resolveServiceWorkerRequests field caused a "cannot find symbol"
     * build error here). minWebViewVersion / minHuaweiWebViewVersion also
     * aren't reproducible this way — CapConfig.Builder has no setters for
     * them in this version either — but this app doesn't override either in
     * capacitor.config.ts, so they fall back to the same defaults
     * loadDefault() would have used anyway. If a future Capacitor upgrade
     * changes CapConfig's fields, this needs re-checking against whatever
     * version apps/mobile/package.json ends up pinned to then.
     */
    private CapConfig withServerUrl(CapConfig source, String serverUrl) {
        CapConfig.Builder builder = new CapConfig.Builder(this)
            .setHTML5mode(source.isHTML5Mode())
            .setServerUrl(serverUrl)
            .setErrorPath(source.getErrorPath())
            .setHostname(source.getHostname())
            .setAndroidScheme(source.getAndroidScheme())
            .setAllowNavigation(source.getAllowNavigation())
            .setOverriddenUserAgentString(source.getOverriddenUserAgentString())
            .setAppendedUserAgentString(source.getAppendedUserAgentString())
            .setBackgroundColor(source.getBackgroundColor())
            .setAllowMixedContent(source.isMixedContentAllowed())
            .setCaptureInput(source.isInputCaptured())
            .setUseLegacyBridge(source.isUsingLegacyBridge())
            .setWebContentsDebuggingEnabled(source.isWebContentsDebuggingEnabled())
            .setZoomableWebView(source.isZoomableWebView())
            .setLoggingEnabled(source.isLoggingEnabled())
            .setInitialFocus(source.isInitialFocus())
            .setStartPath(source.getStartPath());

        // getObject() is @Deprecated on CapConfig but is still the only way to
        // pull the raw "plugins" JSON back out to feed into the Builder,
        // which only accepts it as a JSONObject.
        @SuppressWarnings("deprecation")
        JSONObject pluginsConfig = source.getObject("plugins");
        if (pluginsConfig != null) {
            builder.setPluginsConfiguration(pluginsConfig);
        }

        return builder.create();
    }
}
