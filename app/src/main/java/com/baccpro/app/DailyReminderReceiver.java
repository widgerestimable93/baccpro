package com.baccpro.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.os.Build;

public final class DailyReminderReceiver extends BroadcastReceiver {
    private static final int NOTIFICATION_ID = 1701;

    @Override
    public void onReceive(Context context, Intent intent) {
        DailyReminderScheduler.createNotificationChannel(context);

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            1702,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, DailyReminderScheduler.CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
        }

        Notification notification = builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("C’est l’heure de réviser !")
            .setContentText("Reprends tes révisions sur baccPRO.")
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build();

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification);

        DailyReminderScheduler.scheduleDaily(context);
    }
}
