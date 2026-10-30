package com.baccpro.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import java.util.Calendar;
import java.util.TimeZone;

final class DailyReminderScheduler {
    static final String CHANNEL_ID = "baccpro_daily_17h";
    private static final int ALARM_REQUEST_CODE = 1700;
    private static final TimeZone HAITI_TIME_ZONE =
        TimeZone.getTimeZone("America/Port-au-Prince");

    private DailyReminderScheduler() {}

    static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Rappel quotidien",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Rappel quotidien baccPRO à 17 h, heure d’Haïti");
        channel.enableVibration(true);
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    static void scheduleDaily(Context context) {
        AlarmManager alarmManager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, DailyReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            ALARM_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long triggerAt = nextReminderTime();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                pendingIntent
            );
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        }
    }

    private static long nextReminderTime() {
        Calendar haitiTime = Calendar.getInstance(HAITI_TIME_ZONE);
        haitiTime.set(Calendar.HOUR_OF_DAY, 17);
        haitiTime.set(Calendar.MINUTE, 0);
        haitiTime.set(Calendar.SECOND, 0);
        haitiTime.set(Calendar.MILLISECOND, 0);
        if (haitiTime.getTimeInMillis() <= System.currentTimeMillis()) {
            haitiTime.add(Calendar.DAY_OF_MONTH, 1);
        }
        return haitiTime.getTimeInMillis();
    }
}
