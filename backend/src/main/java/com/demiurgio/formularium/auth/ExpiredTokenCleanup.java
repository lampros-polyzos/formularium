package com.demiurgio.formularium.auth;

import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Once a day, removes refresh tokens that have expired, and browsers not seen for over a year, so the tables do not grow without end; every hour, the "Try the demo" accounts whose day is over. */
@Component
@EnableScheduling
class ExpiredTokenCleanup {
    private final AuthService auth;
    private final DeviceService devices;
    private final AdminService admin;

    ExpiredTokenCleanup(AuthService auth, DeviceService devices, AdminService admin) {
        this.auth = auth;
        this.devices = devices;
        this.admin = admin;
    }

    @Scheduled(cron = "0 17 3 * * *")
    void run() {
        auth.purgeExpiredTokens();
        devices.purgeUnseen();   // browsers not seen for longer than a browser keeps the cookie
        admin.purgeAudit();      // the admin audit log is kept two years
    }

    @Scheduled(cron = "0 41 * * * *")
    void purgeGuests() { auth.purgeExpiredGuests(); }
}
