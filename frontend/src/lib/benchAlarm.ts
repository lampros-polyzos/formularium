// The sound and buzz for a finished timer. Browsers only allow sound after the user has touched the page, so
// `prepareAlarm` is called from the button that starts a timer.

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
    if (context) return context;
    const Ctor = (window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor });
    const Constructor = Ctor.AudioContext ?? Ctor.webkitAudioContext;
    if (!Constructor) return null;
    try {
        context = new Constructor();
    } catch {
        context = null;
    }
    return context;
}

/** Wakes the audio up from a tap, so a beep much later is allowed to play. */
export function prepareAlarm() {
    const audio = audioContext();
    if (audio && audio.state === 'suspended') void audio.resume().catch(() => {});
}

/** Three beeps and a buzz. Quietly does nothing where a device can't do either. */
export function playAlarm() {
    try {
        navigator.vibrate?.([300, 150, 300, 150, 600]);
    } catch {
        // vibration is a bonus
    }
    const audio = audioContext();
    if (!audio) return;
    try {
        for (let i = 0; i < 3; i++) {
            const start = audio.currentTime + i * 0.35;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
            oscillator.connect(gain).connect(audio.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.3);
        }
    } catch {
        // no sound is better than a crash
    }
}
