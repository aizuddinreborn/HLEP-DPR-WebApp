"""Original background music for the how-to video: soft, light pastel-pop loop (synthesised, no samples).
python3 tools/video/music.py out.wav 80 [tap times, comma separated]"""
import sys, wave
import numpy as np

SR = 44100
out = sys.argv[1]
dur = float(sys.argv[2])
taps = [float(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 and sys.argv[3] else []
bpm = 100.0
beat = 60.0 / bpm
n = int(SR * dur)
t = np.arange(n) / SR
mix = np.zeros((n, 2))

def note(m):  # midi → Hz
    return 440.0 * 2 ** ((m - 69) / 12.0)

def env(length, a, r):
    e = np.ones(length)
    ai = max(1, int(a * SR)); ri = max(1, int(r * SR))
    e[:ai] = np.linspace(0, 1, ai)
    e[-ri:] *= np.linspace(1, 0, ri)
    return e

def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= n: return
    sig = sig[: n - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(sig), 0] += sig * gain * l
    mix[i:i + len(sig), 1] += sig * gain * r

# I–V–vi–IV in F major, 2 bars each: F, C, Dm, Bb (Fmaj9-ish voicings)
chords = [[53, 57, 60, 64, 67], [48, 55, 59, 62, 64], [50, 57, 60, 64, 65], [46, 53, 57, 60, 62]]
bar = 4 * beat
pos = 0.0; ci = 0
while pos < dur:
    ch = chords[ci % 4]
    L = 2 * bar
    ln = int(L * SR) + int(0.8 * SR)
    tt = np.arange(ln) / SR
    pad = np.zeros(ln)
    for m in ch[1:]:
        f = note(m)
        for det in (-0.12, 0.12):
            ff = f * 2 ** (det / 12)
            pad += 0.5 * np.sin(2 * np.pi * ff * tt) + 0.12 * np.sin(4 * np.pi * ff * tt)
    pad *= env(ln, 0.6, 0.9) * 0.018
    add(pad, pos, 0.0)
    # bass: root on beats 1 and 3, soft
    for k in range(4):
        bl = int(beat * 1.8 * SR); bt = np.arange(bl) / SR
        f = note(ch[0] - 12)
        bs = (np.sin(2 * np.pi * f * bt) + 0.3 * np.sin(4 * np.pi * f * bt)) * np.exp(-bt * 2.2) * env(bl, 0.01, 0.1)
        add(bs * 0.11, pos + k * 2 * beat)
    # pluck arpeggio, 8th notes
    arp = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[2] + 12, ch[4] + 12, ch[3] + 12]
    for k in range(16):
        m = arp[k % 8]
        pl = int(0.5 * SR); pt = np.arange(pl) / SR
        f = note(m)
        s = (np.sin(2 * np.pi * f * pt) + 0.35 * np.sin(4 * np.pi * f * pt) + 0.1 * np.sin(6 * np.pi * f * pt)) * np.exp(-pt * 7.5)
        s *= env(pl, 0.003, 0.05)
        add(s * 0.05, pos + k * beat / 2, pan=0.35 if k % 2 else -0.35)
    # bell sparkle on bar starts
    for k in (0, 1):
        bl = int(1.4 * SR); bt = np.arange(bl) / SR
        f = note(ch[4] + 24)
        s = (np.sin(2 * np.pi * f * bt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * bt)) * np.exp(-bt * 3.2)
        add(s * 0.018, pos + k * bar, pan=0.2)
    pos += L; ci += 1

# drums from bar 2: soft kick on 1 & 3, shaker on 8ths, clap on 2 & 4
nb = int(dur / beat) + 1
rng = np.random.default_rng(7)
for k in range(nb):
    st = k * beat
    if st < 2 * bar or st > dur - 2.0: continue
    if k % 2 == 0:
        kl = int(0.35 * SR); kt = np.arange(kl) / SR
        f = 110 * np.exp(-kt * 18) + 45
        kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-kt * 9)
        add(kick * 0.16, st)
    else:
        cl = int(0.18 * SR); ct = np.arange(cl) / SR
        clap = rng.standard_normal(cl) * np.exp(-ct * 28)
        clap = np.convolve(clap, np.ones(6) / 6, mode='same')
        add(clap * 0.035, st, pan=0.1)
    for h in (0, 1):
        sl = int(0.07 * SR); stt = np.arange(sl) / SR
        sh = rng.standard_normal(sl) * np.exp(-stt * 60)
        sh = sh - np.convolve(sh, np.ones(3) / 3, mode='same')
        add(sh * (0.03 if h else 0.016), st + h * beat / 2, pan=-0.4 if h else 0.4)

# UI tap "pops"
for tp in taps:
    pl = int(0.12 * SR); pt = np.arange(pl) / SR
    f = 1400 * np.exp(-pt * 25) + 600
    pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-pt * 38)
    add(pop * 0.09, tp)

# master: fade in/out, gentle limiter
fade = np.ones(n)
fi = int(1.2 * SR); fo = int(3.0 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade[:, None]
mix = np.tanh(mix * 2.2) / np.tanh(2.2) * 0.85
pcm = (mix * 32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', out, round(dur, 1), 's')
