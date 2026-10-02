#!/usr/bin/env python3
"""Reproduce the continuous, watermarked synthetic narrators, CPU sequentially.

Run with the pinned official Irodori checkout's Python environment. This script
never downloads weights, executes remote model code, or calls a browser TTS API.
Existing outputs are resumed only when their SHA-256 and input fingerprint match.
"""
from __future__ import annotations
import argparse
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time
import tempfile

CODE_REVISION = "89f9d8fbd4d51ea019867ee1197725ede1df13c5"
MODEL_REVISION = "2b28324dc263ed5e6638b3cf3dd94c82ead07b4b"
CODEC_REVISION = "47376ee24834d7a05a48ebabfe3cde29b3c5e214"
ROOT = Path(__file__).resolve().parents[1]
SEED_PASSAGE = "lemon-opening-v4"
VOICES = {
    "female": {"seed": 20261002, "caption": "落ち着いた大人の女性。自然で柔らかい声で、小説を静かに朗読している。"},
    "male": {"seed": 20261003, "caption": "落ち着いた大人の男性。自然で深みのある声で、小説を静かに朗読している。"},
}

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def atomic_json(path: Path, value: object) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)

def read_requests(path: Path) -> list[dict]:
    requests = json.loads(path.read_text())
    ids = set()
    for row in requests:
        if row["id"] in ids or not all(c.isalnum() or c == "-" for c in row["id"]):
            raise ValueError("Invalid or repeated passage id")
        ids.add(row["id"])
        if "".join(f["text"] for f in row["fragments"]) != row["original"]:
            raise ValueError("Fragment/source mismatch: " + row["id"])
        groups = [i for group in row["normalGroups"] for i in group]
        if groups != list(range(len(row["fragments"]))):
            raise ValueError("Normal groups do not partition hard fragments")
    return sorted(requests, key=lambda x: x["id"] != SEED_PASSAGE)

def publish_provenance(report: dict, assets: Path, watermark_report: dict | None = None, passage_ids: set | None = None) -> None:
    """Small durable artifact; verbose runtime evidence stays in external state."""
    clips = {k: v for k, v in report["clips"].items() if passage_ids is None or v["passageId"] in passage_ids}
    first = next(iter(clips.values()))
    common = dict(first["sampling"])
    for field in ("text", "caption", "ref_wav", "no_ref", "cfg_scale_speaker", "seed"):
        common.pop(field, None)
    voices = {}
    for voice, design in VOICES.items():
        seed = report["clips"].get(f"{SEED_PASSAGE}/{voice}")
        voices[voice] = {**design, "syntheticReference": seed["file"] if seed else None, "referenceSha256": seed["sha256"] if seed else None}
    result = {"version": 1, "model": report["model"], "modelRevision": report["modelRevision"], "codeRevision": report["codeRevision"], "codec": report["codec"], "codecRevision": report["codecRevision"], "precision": "CPU FP32", "runtime": {"python":"3.10.21","pytorch":"2.10.0+cpu","torchaudio":"2.10.0+cpu","transformers":"5.12.1","threads":8,"interopThreads":1}, "sampleRate": 48000, "encoding": "mono PCM16 WAV", "watermark": {"enabled": True, "model": "sony/silentcipher", "revision": "a1c4d021905e0dc5b24be5f68db5fc4dba410ee1", "packageVersion": "1.0.5", "payload": [73,82,68,84,83]}, "voices": voices, "sampling": common, "modes": {"seed": {"no_ref": True, "cfg_scale_speaker": 0.0}, "reference": {"no_ref": False, "cfg_scale_speaker": 5.0}}, "clips": {}}
    checks = (watermark_report or {}).get("checkedFiles", {})
    for key, row in clips.items():
        check = checks.get(Path(row["file"]).name, {})
        result["clips"][key] = {"file": row["file"], "sha256": row["sha256"], "duration": row["duration"], "seed": row["seed"], "inputFingerprint": row["inputFingerprint"], "mode": "seed" if row["referenceSha256"] is None else "reference", "gain": row["appliedLinearGain"], "watermarkVerified": check.get("sha256") == row["sha256"] and check.get("payloadMatched", False)}
    # One compact line per clip keeps review diffs small, while retaining inputs.
    prefix = {k:v for k,v in result.items() if k != "clips"}
    output = json.dumps(prefix, ensure_ascii=False, indent=2)[:-2] + ',\n  "clips": {\n'
    output += ",\n".join("    " + json.dumps(k) + ": " + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k,v in result["clips"].items())
    (assets/"provenance.json").write_text(output + "\n  }\n}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--irodori-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--hf-home", type=Path, required=True)
    parser.add_argument("--requests", type=Path, default=ROOT / "audio-assets/requests.json")
    parser.add_argument("--output", type=Path, default=ROOT / "audio-assets")
    parser.add_argument("--expected-passages", type=int, default=15)
    parser.add_argument("--state-dir", type=Path, default=Path(tempfile.gettempdir()) / "aozora-narration-state", help="External resumable audit state; never commit this directory")
    parser.add_argument("--wait-for-requests", type=int, default=0, help="Wait this many seconds for unfinished curation")
    parser.add_argument("--ids", nargs="*", help="Optional passage subset; seed references must already exist")
    parser.add_argument("--pause-file", type=Path, help="Stop safely after saving the current master when this file exists")
    parser.add_argument("--bootstrap-reports", nargs="*", type=Path, help="Adopt previously generated matching synthetic seed masters")
    args = parser.parse_args()
    code = args.irodori_root.resolve()
    revision = subprocess.check_output(["git", "-C", str(code), "rev-parse", "HEAD"], text=True).strip()
    if revision != CODE_REVISION:
        raise ValueError("Irodori code revision differs from pinned provenance")
    for key, value in {"HF_HOME": str(args.hf_home.resolve()), "HF_HUB_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1", "OMP_NUM_THREADS": "8", "MKL_NUM_THREADS": "8", "XDG_CACHE_HOME": str(args.hf_home.parent / "cache"), "MPLCONFIGDIR": str(args.hf_home.parent / "cache/matplotlib"), "NUMBA_CACHE_DIR": str(args.hf_home.parent / "cache/numba")}.items():
        os.environ.setdefault(key, value)
    sys.path.insert(0, str(code))
    import numpy as np
    import soundfile as sf
    import torch
    from irodori_tts.inference_runtime import InferenceRuntime, RuntimeKey, SamplingRequest
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "masters").mkdir(exist_ok=True)
    args.state_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.state_dir / "generation.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {
        "version": 1,
        "model": "Aratako/Irodori-TTS-v4.1-Small", "modelRevision": MODEL_REVISION,
        "codeRepository": "https://github.com/Aratako/Irodori-TTS", "codeRevision": CODE_REVISION,
        "codec": "Aratako/Semantic-DACVAE-Japanese-32dim", "codecRevision": CODEC_REVISION,
        "modelDevice": "cpu", "codecDevice": "cpu", "precision": "float32", "threads": 8,
        "watermark": {"library": "sony/SilentCipher", "payload": [73, 82, 68, 84, 83], "enabled": True, "detectionVerified": False},
        "encoding": "48000 Hz mono PCM16 WAV", "voices": VOICES, "clips": {},
        "notes": ["Both voice identities are fictional, caption-designed synthetic references, not human clones.", "All passages are generated continuously. No splicing, silence insertion, time stretching, or browser speech synthesis.", "PCM saving only uniformly attenuates raw peaks above 0.95; watermark encoding precedes saving.", "Machine checks are not a claim of human listening or verified watermark detection."]}
    if not report_path.exists() and (args.output / "provenance.json").exists():
        saved = json.loads((args.output / "provenance.json").read_text())
        current = {r["id"]: r for r in read_requests(args.requests)}
        for key, row in saved["clips"].items():
            passage, voice = key.split("/")
            settings = {**saved["sampling"], **saved["modes"][row["mode"]], "text": current[passage]["speechText"], "caption": VOICES[voice]["caption"], "seed": row["seed"], "ref_wav": None if row["mode"] == "seed" else saved["voices"][voice]["syntheticReference"]}
            report["clips"][key] = {**row, "passageId": passage, "voice": voice, "sampling": settings, "sampleRate": saved["sampleRate"], "samples": round(row["duration"] * saved["sampleRate"]), "referenceSha256": None if row["mode"] == "seed" else saved["voices"][voice]["referenceSha256"], "appliedLinearGain": row["gain"]}
    def publish():
        watermarks = args.state_dir / "watermarks.json"
        checks = json.loads(watermarks.read_text()) if watermarks.exists() else None
        # Preserve a prior verified result only for exactly the same output hash.
        if checks is None and (args.output / "provenance.json").exists():
            old = json.loads((args.output / "provenance.json").read_text())
            checks = {"checkedFiles": {Path(v["file"]).name: {"sha256": v["sha256"], "payloadMatched": v.get("watermarkVerified", False)} for v in old["clips"].values()}}
        publish_provenance(report, args.output, checks)
    def fingerprint(item, voice, reference_sha):
        value = {"original": item["original"], "speechText": item["speechText"], "voice": voice, "referenceSha256": reference_sha, "steps": 40, "modelRevision": MODEL_REVISION, "codeRevision": CODE_REVISION}
        return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    def output_path(item, voice):
        return args.output / "masters" / f'{item["id"]}-{voice}.wav'
    def record(item, voice, path, request, elapsed, peak, gain, stage_timings, messages, seed, reference_sha, provenance):
        audio, rate = sf.read(path, dtype="float32")
        if audio.ndim != 1 or rate != 48000 or not len(audio) or not np.isfinite(audio).all():
            raise ValueError("Invalid generated waveform")
        rms = float(np.sqrt(np.mean(audio ** 2)))
        if rms < 0.005 or float(np.abs(audio).max()) > 0.9501:
            raise ValueError("Silent or clipped output")
        duration = len(audio) / rate
        if not 5 <= duration <= 30:
            raise ValueError("Outside supported continuous duration")
        row = {"passageId": item["id"], "voice": voice, "file": f"masters/{path.name}", "sha256": sha(path), "inputFingerprint": fingerprint(item, voice, reference_sha), "samples": len(audio), "sampleRate": rate, "duration": duration, "speechText": item["speechText"], "sourceUrl": item["sourceUrl"], "sampling": request, "seed": seed, "referenceSha256": reference_sha, "generationSeconds": elapsed, "rawPeak": peak, "appliedLinearGain": gain, "peak": float(np.abs(audio).max()), "rms": rms, "peakRssMiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, "stageTimings": stage_timings, "messages": messages, "provenance": provenance, "durationTargetMet": 18 <= duration <= 27}
        report["clips"][f'{item["id"]}/{voice}'] = row
        atomic_json(report_path, report)
        publish()
        print("SAVED " + json.dumps({k: row[k] for k in ("passageId", "voice", "duration", "generationSeconds", "sha256")}), flush=True)
    requests = read_requests(args.requests)
    seed_item = next(x for x in requests if x["id"] == SEED_PASSAGE)
    if args.bootstrap_reports:
        import shutil
        for source_report in args.bootstrap_reports:
            prior = json.loads(source_report.read_text())
            if prior["code_commit"] != CODE_REVISION or not prior["watermarker_ready"]:
                raise ValueError("Unverified bootstrap provenance")
            for sample in prior["samples"]:
                voice = "female" if "female" in sample["id"] else "male"
                settings = sample["sampling"]
                if settings["text"] != seed_item["speechText"] or settings["caption"] != VOICES[voice]["caption"] or not settings["no_ref"]:
                    raise ValueError("Bootstrap is not the exact synthetic seed")
                path = output_path(seed_item, voice)
                shutil.copyfile(sample["path"], path)
                record(seed_item, voice, path, settings, sample["elapsed_seconds"], sample["raw_peak"], sample["applied_linear_gain"], sample["stage_timings"], sample["messages"], sample["seed"], None, "Reused exact previously generated caption-designed synthetic seed, PCM unchanged")
    runtime = None
    seen_since = time.monotonic()
    while True:
        requests = read_requests(args.requests)
        pending = []
        for item in requests:
            if args.ids and item["id"] not in args.ids:
                continue
            for voice in VOICES:
                ref = args.output / "masters" / f"{SEED_PASSAGE}-{voice}.wav"
                reference_sha = None if item["id"] == SEED_PASSAGE else sha(ref) if ref.exists() else None
                if item["id"] != SEED_PASSAGE and reference_sha is None:
                    if args.ids and SEED_PASSAGE not in args.ids:
                        raise ValueError("Generate seed passage before reference-conditioned passages")
                    continue
                path = output_path(item, voice)
                existing = report["clips"].get(f'{item["id"]}/{voice}')
                if existing and path.exists() and sha(path) == existing["sha256"] and existing["inputFingerprint"] == fingerprint(item, voice, reference_sha):
                    continue
                pending.append((item, voice, reference_sha))
        if not pending:
            if args.ids or len(requests) >= args.expected_passages:
                break
            if time.monotonic() - seen_since > args.wait_for_requests:
                raise RuntimeError(f"Only {len(requests)}/{args.expected_passages} curated passages are available")
            time.sleep(5)
            continue
        if runtime is None:
            print("Loading pinned offline CPU FP32 Irodori runtime", flush=True)
            runtime = InferenceRuntime.from_key(RuntimeKey(checkpoint=str(args.checkpoint.absolute()), model_device="cpu", codec_device="cpu"))
            if not runtime.watermarker.ready:
                raise RuntimeError("Watermark backend unavailable; generation must not silently drop it")
        for item, voice, reference_sha in pending:
            item = next(x for x in read_requests(args.requests) if x["id"] == item["id"])
            ref_path = args.output / "masters" / f"{SEED_PASSAGE}-{voice}.wav"
            is_seed = item["id"] == SEED_PASSAGE
            seed = VOICES[voice]["seed"] if is_seed else 20261000 + int(hashlib.sha256(f'{item["id"]}/{voice}'.encode()).hexdigest()[:6], 16)
            request = SamplingRequest(text=item["speechText"], caption=VOICES[voice]["caption"], ref_wav=None if is_seed else str(ref_path.resolve()), no_ref=is_seed, num_steps=40, cfg_scale_text=3., cfg_scale_caption=3., cfg_scale_speaker=0. if is_seed else 5., seed=seed, max_seconds=30.)
            print(f'GENERATING {item["id"]}/{voice}', flush=True)
            started = time.perf_counter()
            result = runtime.synthesize(request, log_fn=lambda s: print(s, flush=True))
            elapsed = time.perf_counter() - started
            waveform = result.audio.detach().float().cpu().squeeze().numpy()
            if not np.isfinite(waveform).all():
                raise ValueError("Non-finite synthesis")
            peak = float(np.max(np.abs(waveform)))
            gain = min(1., .95 / max(peak, 1e-12))
            path = output_path(item, voice)
            sf.write(path, waveform * gain, result.sample_rate, subtype="PCM_16")
            settings = dataclasses.asdict(request)
            settings["ref_wav"] = None if is_seed else f"masters/{ref_path.name}"
            record(item, voice, path, settings, elapsed, peak, gain, result.stage_timings, result.messages, result.used_seed, reference_sha, "Official offline Irodori runtime, one continuous synthesis")
            seen_since = time.monotonic()
            if args.pause_file and args.pause_file.exists():
                print("PAUSED after saving the current complete master", flush=True)
                return
    publish()
    print(f'COMPLETE: {len(report["clips"])} continuous masters', flush=True)

if __name__ == "__main__":
    main()
