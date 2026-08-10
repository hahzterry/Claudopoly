#!/usr/bin/env python3
"""
blind-pair.py — build a blind A/B comparison set.

Takes our screenshot and a benchmark screenshot, strips identifying filenames,
normalises them to the same size, and writes them as A.png / B.png into
bench/blind/<round>/ with a randomised assignment. The key that says which is
which is written OUTSIDE that directory, into bench/blind-keys/, so a critic
pointed at the blind directory cannot accidentally read it.

Usage: blind-pair.py <round> <ours.png> <benchmark.jpg> [--salt N]
"""
import sys, os, json, hashlib, subprocess, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")


def normalise(src, dst, width=1400):
    """Resize to a common width with sips (present on macOS) so neither image
    is distinguishable by resolution alone."""
    shutil.copy(src, dst)
    try:
        subprocess.run(["sips", "--resampleWidth", str(width), dst],
                       check=True, capture_output=True)
    except Exception as e:
        print(f"  (sips unavailable, left at native size: {e})")
    return dst


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    rnd, ours, bench = sys.argv[1], sys.argv[2], sys.argv[3]
    salt = 0
    if "--salt" in sys.argv:
        salt = int(sys.argv[sys.argv.index("--salt") + 1])

    outdir = os.path.join(ROOT, "bench", "blind", rnd)
    keydir = os.path.join(ROOT, "bench", "blind-keys")
    os.makedirs(outdir, exist_ok=True)
    os.makedirs(keydir, exist_ok=True)

    # Deterministic but non-obvious assignment, so reruns are reproducible.
    h = hashlib.sha256(f"{rnd}|{ours}|{bench}|{salt}".encode()).hexdigest()
    ours_is_a = int(h[:8], 16) % 2 == 0

    a_src, b_src = (ours, bench) if ours_is_a else (bench, ours)
    a_dst = normalise(a_src, os.path.join(outdir, "A.png"))
    b_dst = normalise(b_src, os.path.join(outdir, "B.png"))

    key = {
        "round": rnd,
        "A": "ours" if ours_is_a else "benchmark",
        "B": "benchmark" if ours_is_a else "ours",
        "oursSource": os.path.relpath(ours, ROOT),
        "benchmarkSource": os.path.relpath(bench, ROOT),
    }
    with open(os.path.join(keydir, f"{rnd}.json"), "w") as f:
        json.dump(key, f, indent=1)

    print(f"blind set written -> bench/blind/{rnd}/A.png and B.png")
    print(f"key (not in that directory) -> bench/blind-keys/{rnd}.json")


if __name__ == "__main__":
    main()
