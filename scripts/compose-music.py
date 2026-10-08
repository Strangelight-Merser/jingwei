"""Compose the demo video's background track: an original, quiet ambient piece (no samples, no licence).

Four chords in D major (Dmaj9 – Bm9 – Gmaj7 – A6sus) at 72 BPM: a soft detuned pad, a low root, and a
sparse bell arpeggio, with a synthetic reverb tail. Writes exports/submission/music.wav (stereo, 44.1 kHz),
which scripts/build-demo-video.py mixes under the picture at low volume.
Run: python3 scripts/compose-music.py [seconds]
"""
from pathlib import Path
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import fftconvolve

SR = 44_100
LENGTH = float(sys.argv[1]) if len(sys.argv) > 1 else 140.0
BEAT = 60 / 72
BAR = 4 * BEAT
rng = np.random.default_rng(7)

def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)

# MIDI notes: pad voicing, bass root, arpeggio pool.
CHORDS = [
    {'pad': [62, 66, 69, 73, 76], 'bass': 38, 'arp': [74, 78, 81, 85, 88]},   # Dmaj9
    {'pad': [59, 62, 66, 69, 73], 'bass': 35, 'arp': [71, 74, 78, 81, 85]},   # Bm9
    {'pad': [55, 59, 62, 66, 71], 'bass': 31, 'arp': [67, 71, 74, 78, 83]},   # Gmaj7
    {'pad': [57, 62, 64, 66, 69], 'bass': 33, 'arp': [69, 74, 76, 78, 81]},   # A6sus
]

total = int(SR * LENGTH)
left = np.zeros(total)
right = np.zeros(total)

def add(signal: np.ndarray, start: float, pan: float = 0.0):
    i = int(start * SR)
    if i >= total:
        return
    signal = signal[: total - i]
    left[i:i + len(signal)] += signal * np.sqrt((1 - pan) / 2)
    right[i:i + len(signal)] += signal * np.sqrt((1 + pan) / 2)

def envelope(n: int, attack: float, release: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    r = np.clip((n / SR - t) / release, 0, 1)
    return np.sin(a * np.pi / 2) ** 2 * np.sin(r * np.pi / 2) ** 2

def pad(midi: int, seconds: float) -> np.ndarray:
    n = int(seconds * SR); t = np.arange(n) / SR; f = hz(midi)
    voice = sum(np.sin(2 * np.pi * f * (1 + d) * t + rng.uniform(0, 6.28)) for d in (-0.0021, 0, 0.0023))
    voice += 0.18 * np.sin(2 * np.pi * 2 * f * t)  # a little brightness
    shimmer = 1 + 0.06 * np.sin(2 * np.pi * 0.21 * t + rng.uniform(0, 6.28))
    return voice * shimmer * envelope(n, 1.6, 2.2) * 0.035

def bass(midi: int, seconds: float) -> np.ndarray:
    n = int(seconds * SR); t = np.arange(n) / SR; f = hz(midi)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * envelope(n, 0.4, 1.2) * 0.07

def bell(midi: int) -> np.ndarray:
    n = int(2.6 * SR); t = np.arange(n) / SR; f = hz(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.01 * f * t) + 0.12 * np.sin(2 * np.pi * 3.98 * f * t)
    return tone * np.exp(-t * 2.4) * np.clip(t / 0.004, 0, 1) * 0.045

bar = 0
start = 0.0
# Arpeggio enters after two bars and leaves before the end, so the track opens and closes on the pad.
while start < LENGTH:
    chord = CHORDS[bar % len(CHORDS)]
    hold = BAR + 1.2  # overlap into the next chord for a smooth change
    for k, note in enumerate(chord['pad']):
        add(pad(note, hold), start, pan=(k - 2) * 0.28)
    add(bass(chord['bass'], hold), start)
    if 2 <= bar and start < LENGTH - BAR * 2:
        pattern = [0, 2, 1, 3, 2, 4, 3, 1]
        for step, index in enumerate(pattern):
            if rng.random() < 0.72:  # leave gaps so it breathes
                add(bell(chord['arp'][index]), start + step * BEAT / 2 + rng.uniform(0, 0.012), pan=rng.uniform(-0.5, 0.5))
    bar += 1
    start += BAR

# Reverb: exponentially decaying noise impulse, different per channel for width.
def reverb(x: np.ndarray, seed: int) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = int(3.2 * SR); t = np.arange(n) / SR
    impulse = r.standard_normal(n) * np.exp(-t * 2.1)
    impulse[: int(0.02 * SR)] = 0
    wet = fftconvolve(x, impulse)[: len(x)]
    return x * 0.72 + wet / np.max(np.abs(wet)) * np.max(np.abs(x)) * 0.55

left, right = reverb(left, 1), reverb(right, 2)
mix = np.stack([left, right], axis=1)
fade = int(3 * SR)
mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix /= np.max(np.abs(mix)) / 0.6
out = Path(__file__).resolve().parents[1] / 'exports' / 'submission' / 'music.wav'
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f'{out.name}: {LENGTH:.0f} s')
