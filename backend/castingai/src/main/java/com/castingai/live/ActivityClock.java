package com.castingai.live;

import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Horloge d'activité : chaque action réussie qui modifie des données avance le compteur.
 * Les pages ouvertes demandent régulièrement « quelqu'un d'autre a-t-il agi depuis N ? »
 * et se rafraîchissent seules — plus besoin de s'appeler pour dire « c'est fait, regarde ».
 */
@Component
public class ActivityClock {

    private record Tick(long seq, String actor) {}

    private static final int KEEP = 1000;
    private final Deque<Tick> ticks = new ArrayDeque<>();
    private long seq = 0;

    public synchronized long tick(String actor) {
        seq++;
        ticks.addLast(new Tick(seq, actor == null ? "" : actor));
        while (ticks.size() > KEEP) ticks.removeFirst();
        return seq;
    }

    public record Pulse(long seq, boolean others) {}

    /** Le compteur actuel, et si quelqu'un d'autre que {@code me} a agi depuis {@code since}. */
    public synchronized Pulse pulse(String me, long since) {
        if (since < 0) return new Pulse(seq, false);
        if (since > seq) return new Pulse(seq, true); // serveur redémarré : on rafraîchit par prudence
        if (since == seq) return new Pulse(seq, false);
        Tick oldest = ticks.peekFirst();
        if (oldest == null || oldest.seq() > since + 1) return new Pulse(seq, true);
        for (var it = ticks.descendingIterator(); it.hasNext(); ) {
            Tick t = it.next();
            if (t.seq() <= since) break;
            if (!t.actor().equalsIgnoreCase(me)) return new Pulse(seq, true);
        }
        return new Pulse(seq, false);
    }
}
