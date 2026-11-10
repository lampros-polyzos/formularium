package com.demiurgio.formularium.auth;

/**
 * A browser's identification string, in words a person recognises: "Chrome on Windows". Only a rough guess, which is all an email needs: the string is whatever the
 * browser says it is, and the order of the checks matters because most browsers pretend to be several others (Edge and Opera say "Chrome", Chrome says "Safari",
 * an iPhone says "Mac OS X", Android says "Linux").
 */
final class UserAgents {
    private UserAgents() { }

    static String describe(String ua) {
        if (ua == null || ua.isBlank()) return "an unrecognised browser";
        String browser = contains(ua, "Edg/", "EdgA/", "EdgiOS/") ? "Edge"
                : contains(ua, "OPR/", "Opera") ? "Opera"
                : contains(ua, "Firefox/", "FxiOS/") ? "Firefox"
                : contains(ua, "Chrome/", "CriOS/") ? "Chrome"
                : ua.contains("Safari/") ? "Safari"
                : null;
        String os = ua.contains("Windows") ? "Windows"
                : contains(ua, "iPhone", "iPad", "iPod") ? "iOS"
                : ua.contains("Android") ? "Android"
                : contains(ua, "Macintosh", "Mac OS X") ? "macOS"
                : ua.contains("CrOS") ? "ChromeOS"
                : ua.contains("Linux") ? "Linux"
                : null;
        if (browser != null && os != null) return browser + " on " + os;
        if (browser != null) return browser;
        if (os != null) return "a browser on " + os;
        return "an unrecognised browser";
    }

    private static boolean contains(String text, String... any) {
        for (String part : any) if (text.contains(part)) return true;
        return false;
    }
}
