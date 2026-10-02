#!/usr/bin/env python3
"""Known-text CTC alignment + waveform-qualified continuous-master cue points.

The local Japanese XLSR CTC checkpoint supplies text neighborhoods, not phoneme
edges. Waveform gaps refine candidate boundaries. Ambiguous boundaries remain
explicitly review_needed; this script never fabricates proportional timestamps.
Use the generation environment (torch/torchaudio, transformers, scipy, soundfile).
"""
from __future__ import annotations
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MODEL = "jonatasgrosman/wav2vec2-large-xlsr-53-japanese"
REVISION = "cf031e020336460d15a417eba710bbc5bb43be9a"
# Spell out only the out-of-vocabulary lexical items. No phonetic transcript is
# forced onto a model trained to emit mostly kanji graphemes.
ALIGNMENT_REPLACEMENTS = {"焦躁": "焦そう", "檸檬": "れもん", "搾": "しぼ", "爽": "さわ", "鞄": "かばん", "笛": "ぶえ", "渚": "なぎさ"}

def map_boundary(before: str, after: str, offset: int) -> int:
    """Map only exact/edit endpoints; never interpolate through replacements."""
    candidates = []
    for tag, a, b, c, d in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
        if tag == "equal" and a <= offset <= b:
            candidates.append(c + offset - a)
        elif offset == a:
            candidates.append(c)
        elif offset == b:
            candidates.append(d)
        elif a < offset < b:
            raise ValueError(f"Boundary {offset} lies inside speech replacement {before[a:b]!r} -> {after[c:d]!r}")
    if not candidates:
        raise ValueError("Boundary cannot be mapped exactly")
    # Inserted punctuation is silent for CTC, so either endpoint has the same
    # acoustic-token count. Prefer the end to attach pauses to the prefix.
    return max(candidates)

def alignment_targets(item: dict, vocab: dict) -> tuple[str, list[int], list[dict]]:
    original, speech = item["original"], item["speechText"]
    transformed = speech
    changes = []
    for old, new in ALIGNMENT_REPLACEMENTS.items():
        if old in transformed:
            changes.append({"before": old, "after": new, "purpose": "alignment-only vocabulary normalization"})
            transformed = transformed.replace(old, new)
    def audible(c):
        return not unicodedata.category(c).startswith(("P", "Z", "S")) and c not in "\n\r\t"
    unknown = sorted({c for c in transformed if audible(c) and c not in vocab})
    if unknown:
        raise ValueError(f'{item["id"]}: unmapped alignment vocabulary {unknown}; add an explicit reading, never omit it')
    target = "".join(c for c in transformed if audible(c))
    indices, offset, speech_offset = [], 0, 0
    speech_fragments = item.get("speechFragments")
    if speech_fragments is not None and (len(speech_fragments) != len(item["fragments"]) or "".join(speech_fragments) != speech):
        raise ValueError("Speech fragments must exactly partition speechText")
    for fragment_index, fragment in enumerate(item["fragments"][:-1]):
        offset += len(fragment["text"])
        if speech_fragments is not None:
            speech_offset += len(speech_fragments[fragment_index])
        else:
            speech_offset = map_boundary(original, speech, offset)
        target_offset = map_boundary(speech, transformed, speech_offset)
        indices.append(sum(audible(c) for c in transformed[:target_offset]))
    if not all(0 < x < len(target) for x in indices) or indices != sorted(set(indices)):
        raise ValueError("Non-monotonic or empty aligned fragments")
    return target, indices, changes

def pick_boundary(audio, sr, left, right, previous_cut):
    import numpy as np
    # Last preceding and first following acoustic-token spikes bracket the
    # neighborhood. They do not claim word onset/offset precision.
    lo = max(left["end"], previous_cut + .04)
    hi = right["start"]
    if hi <= lo:
        if left["end"] <= previous_cut:
            raise ValueError("Non-monotonic CTC path needs editorial/audio repair")
        n = round(left["end"] * sr)
        local = audio[max(0,n-round(sr*.01)):min(len(audio),n+round(sr*.01))]
        return {"cut":n/sr,"sample":n,"method":"no_ctc_gap_review_required","ctcNeighborhood":[left["end"],right["start"]],"gapSeconds":0.,"rmsDbfs20ms":round(float(20*np.log10(np.sqrt(np.mean(local.astype(float)**2))+1e-12)),2),"previousToken":left,"nextToken":right,"lowAdjacentTokenConfidence":min(left["score"],right["score"])<.08,"status":"review_needed","listeningVerified":False}
    win = max(1, round(sr * .010))
    hop = max(1, round(sr * .002))
    centers = np.arange(round(lo * sr), round(hi * sr) + 1, hop, dtype=int)
    db = np.array([20 * np.log10(np.sqrt(np.mean(audio[max(0, n-win//2):min(len(audio), n+win//2)].astype(float)**2)) + 1e-12) for n in centers])
    quiet = db < -58
    runs = []
    first = None
    for i, yes in enumerate(quiet):
        if yes and first is None: first = i
        if first is not None and (not yes or i == len(quiet)-1):
            end = i if not yes else i + 1
            if end - first >= 2:
                runs.append((first, end))
            first = None
    chosen = max(runs, key=lambda p: p[1]-p[0]) if runs else None
    gap_width = ((chosen[1]-chosen[0])*hop/sr) if chosen else 0.
    if chosen and gap_width >= .04:
        # Physical gap midpoint is independent of character count.
        n = int(centers[(chosen[0]+chosen[1]-1)//2])
        method = "low_energy_gap_midpoint"
    else:
        # Review candidate only: stay in the early part of the acoustic bracket
        # so that an onset occurring before a CTC peak is not knowingly included.
        early_hi = max(lo, min(hi-.025, lo + .55*(hi-lo)))
        eligible = np.flatnonzero(centers/sr <= early_hi)
        if not len(eligible): eligible = np.array([0])
        idx = int(eligible[np.argmin(db[eligible])])
        n = int(centers[idx])
        method = "conservative_waveform_minimum_review_required"
    cut = n / sr
    local = audio[max(0,n-win):min(len(audio),n+win)]
    low_confidence = min(left["score"], right["score"]) < .08
    clear = gap_width >= .080 and cut-lo >= .025 and hi-cut >= .025
    return {"cut": cut, "sample": n, "method": method, "ctcNeighborhood": [lo, hi], "gapSeconds": round(gap_width, 6), "rmsDbfs20ms": round(float(20*np.log10(np.sqrt(np.mean(local.astype(float)**2))+1e-12)),2), "previousToken": left, "nextToken": right, "lowAdjacentTokenConfidence": low_confidence, "status": "machine_gap_candidate" if clear else "review_needed", "listeningVerified": False}

def emit_typescript(report, generation, path):
    data = {}
    for key, row in report["clips"].items():
        gen = generation["clips"][key]
        if row["sha256"] != gen["sha256"]:
            continue  # Never publish stale cue timings for newly generated bytes.
        data.setdefault(gen["passageId"], {})[gen["voice"]] = {"passageId": gen["passageId"], "voice": gen["voice"], "file": Path(gen["file"]).name, "duration": gen["duration"], "sampleRate": gen["sampleRate"], "sha256": gen["sha256"], "cues": row["cues"]}
    header = '''/** Generated by scripts/align-narration.py. Continuous Irodori masters. */
export type NarrationVoice = "female" | "male";
export interface NarrationCue { text: string; start: number; end: number; safeEnd?: boolean }
export interface NarrationClip {
  passageId: string; voice: NarrationVoice; url: string; duration: number;
  sampleRate: number; cues: readonly NarrationCue[]; sha256: string;
}
// Immutable asset commit; changed only after audio-assets has been committed.
export const NARRATION_ASSET_REVISION = "PENDING_ASSET_COMMIT";
export const NARRATION_ASSET_BASE_URL = `https://raw.githubusercontent.com/ivgtr/puzzroaozora/${NARRATION_ASSET_REVISION}/audio-assets/masters`;
'''
    # Preserve an integration-pinned SHA when rerunning alignment.
    if path.exists():
        match = re.search(r'NARRATION_ASSET_REVISION = "([a-f0-9]{40})"', path.read_text())
        if match: header = header.replace("PENDING_ASSET_COMMIT", match[1])
    rows = []
    for passage, voices in data.items():
        if set(voices) != {"female", "male"}:
            continue
        parts = []
        for voice, clip in voices.items():
            filename = clip.pop("file")
            serialized = json.dumps(clip, ensure_ascii=False, indent=2)
            serialized = serialized[:-1] + ',\n  "url": `${NARRATION_ASSET_BASE_URL}/' + filename + '`\n}'
            parts.append(json.dumps(voice)+": "+serialized)
        rows.append(json.dumps(passage)+": {\n"+",\n".join(parts)+"\n}")
    path.write_text(header+'export const NARRATION: Readonly<Record<string, Readonly<Record<NarrationVoice, NarrationClip>>>> = {\n'+",\n".join(rows)+'\n};\n')

def publish_cues(report: dict, assets: Path, passage_ids: set | None = None) -> None:
    compact = {"version": 1, "method": "Known-text CTC plus waveform-qualified gaps", "model": MODEL, "revision": REVISION, "frameStepSeconds": .02, "listeningVerified": False, "clips": {}}
    for key, row in report["clips"].items():
        if passage_ids is not None and key.split("/")[0] not in passage_ids: continue
        if "boundaries" in row:
            gaps = [q["gapSeconds"] for q in row["boundaries"] if q["status"] == "machine_gap_candidate"]
            quality = {"qualifiedBoundaries": len(row["boundaries"])-row["reviewNeeded"], "reviewNeeded": row["reviewNeeded"], "minimumGapSeconds": min(gaps) if gaps else None, "pcmReconstructionExact": row["pcmReconstructionExact"]}
        else:
            quality = row["quality"]
        compact["clips"][key] = {"sha256": row["sha256"], "ends": [c["end"] for c in row["cues"]], "safeEnds": [c.get("safeEnd",False) for c in row["cues"]], "quality": quality}
    prefix = {k:v for k,v in compact.items() if k != "clips"}
    output = json.dumps(prefix, ensure_ascii=False, indent=2)[:-2] + ',\n  "clips": {\n'
    output += ",\n".join("    " + json.dumps(k) + ": " + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k,v in compact["clips"].items())
    (assets/"cues.json").write_text(output + "\n  }\n}\n")


def verify_watermarks(args, generation):
    """Verify saved PCM via the pinned local decoder, retaining small booleans."""
    import importlib.metadata
    import soundfile as sf
    import torch
    import silentcipher
    torch.set_num_threads(6)
    snapshot = args.watermark_model_dir
    revision = "a1c4d021905e0dc5b24be5f68db5fc4dba410ee1"
    if snapshot.name != revision:
        raise ValueError("Expected exact pinned SilentCipher snapshot directory")
    checkpoint = snapshot/"44_1_khz/73999_iteration"
    config = checkpoint/"hparams.yaml"
    if not checkpoint.is_dir() or not config.is_file():
        raise ValueError("Local SilentCipher checkpoint is incomplete; refusing an implicit download")
    checks_path = args.state_dir/"watermarks.json"
    checks = json.loads(checks_path.read_text()) if checks_path.exists() else {"version":1,"decoder":"sony/SilentCipher","modelRevision":revision,"packageVersion":importlib.metadata.version("silentcipher"),"expectedPayload":[73,82,68,84,83],"phaseShiftDecoding":False,"checkedFiles":{}}
    decoder = None
    for key, row in generation["clips"].items():
        if args.ids and key.split("/")[0] not in args.ids: continue
        file = args.assets/row["file"]
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        prior = checks["checkedFiles"].get(file.name,{})
        if prior.get("sha256") == digest and prior.get("payloadMatched"): continue
        if decoder is None:
            decoder = silentcipher.get_model(model_type="44.1k",ckpt_path=str(checkpoint),config_path=str(config),device="cpu")
        audio, sr = sf.read(file,dtype="float32")
        result = decoder.decode_wav(torch.from_numpy(audio),sr,phase_shift_decoding=False)
        matched = bool(result["status"] and [73,82,68,84,83] in result["messages"])
        checks["checkedFiles"][file.name] = {"sha256":digest,"payloadMatched":matched,"decoderResult":result}
        checks_path.write_text(json.dumps(checks,indent=2)+"\n")
        print(f"WATERMARK {key}: {'verified' if matched else 'not verified'}",flush=True)
    provenance_path = args.assets/"provenance.json"
    provenance = json.loads(provenance_path.read_text())
    for row in provenance["clips"].values():
        result = checks["checkedFiles"].get(Path(row["file"]).name,{})
        row["watermarkVerified"] = result.get("sha256") == row["sha256"] and result.get("payloadMatched",False)
    prefix = {k:v for k,v in provenance.items() if k != "clips"}
    text = json.dumps(prefix,ensure_ascii=False,indent=2)[:-2] + ',\n  "clips": {\n'
    text += ",\n".join("    "+json.dumps(k)+": "+json.dumps(v,ensure_ascii=False,separators=(",",":")) for k,v in provenance["clips"].items())
    provenance_path.write_text(text+"\n  }\n}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True, help="Local pinned XLSR model snapshot (no download)")
    parser.add_argument("--assets", type=Path, default=ROOT/"audio-assets")
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--state-dir", type=Path, default=Path(tempfile.gettempdir()) / "aozora-narration-state", help="External audit directory; never commit raw CTC traces")
    parser.add_argument("--watermark-model-dir", type=Path, help="Optional pinned local Sony SilentCipher snapshot to verify saved WAV watermarks")
    parser.add_argument("--cache-dir", type=Path, help="Optional external emission cache; never commit model/emission arrays")
    parser.add_argument("--emit-only", action="store_true")
    parser.add_argument("--manifest", type=Path, default=ROOT/"src/data/narration.ts", help="Generated TypeScript destination")
    args = parser.parse_args()
    args.state_dir.mkdir(parents=True, exist_ok=True)
    if (args.state_dir/"generation.json").exists():
        generation = json.loads((args.state_dir/"generation.json").read_text())
    else:
        generation = json.loads((args.assets/"provenance.json").read_text())
        generation["clips"] = {k:{**v,"passageId":k.split("/")[0],"voice":k.split("/")[1],"sampleRate":generation["sampleRate"]} for k,v in generation["clips"].items()}
    report_path = args.state_dir/"alignment.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {"version": 1, "model": MODEL, "revision": REVISION, "license": "Apache-2.0", "method": "Known synthesis text CTC alignment followed by bounded waveform energy inspection", "frameStepSeconds": .02, "listeningVerified": False, "limitations": ["CTC spikes locate graphemes, not complete phonemes", "A quiet interval can also be a stop closure; the machine candidates still require listening review", "review_needed marks a fine boundary without a clear acoustic gap", "No timestamp is inferred from character proportions", "The same unchanged master and hard cues serve normal and hard modes"], "clips": {}}
    if not report_path.exists() and (args.assets/"cues.json").exists():
        saved_cues = json.loads((args.assets/"cues.json").read_text())
        requests_by_id = {r["id"]:r for r in json.loads((args.assets/"requests.json").read_text())}
        for key, value in saved_cues["clips"].items():
            item = requests_by_id[key.split("/")[0]]
            if len(value["ends"]) != len(item["fragments"]): continue
            starts = [0.] + value["ends"][:-1]
            report["clips"][key] = {"sha256": value["sha256"], "cues": [{"text":f["text"],"start":starts[i],"end":value["ends"][i],"safeEnd":value["safeEnds"][i]} for i,f in enumerate(item["fragments"])],"quality":value["quality"]}
    if not args.emit_only:
        import numpy as np
        import soundfile as sf
        import torch
        import torchaudio
        from scipy.signal import resample_poly
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        processor = Wav2Vec2Processor.from_pretrained(str(args.model_dir), local_files_only=True)
        vocab = processor.tokenizer.get_vocab()
        model = None
        requests = json.loads((args.assets/"requests.json").read_text())
        for item in requests:
            if args.ids and item["id"] not in args.ids: continue
            target, boundaries, replacements = alignment_targets(item, vocab)
            for voice in ("female", "male"):
                key = f'{item["id"]}/{voice}'
                if key not in generation["clips"]: continue
                gen = generation["clips"][key]
                file = args.assets/gen["file"]
                if hashlib.sha256(file.read_bytes()).hexdigest() != gen["sha256"]: raise ValueError("Audio hash mismatch")
                audio, sr = sf.read(file, dtype="float32")
                cache = args.cache_dir/f'{item["id"]}-{voice}-{gen["sha256"][:12]}.npy' if args.cache_dir else None
                if cache and cache.exists():
                    logp = torch.from_numpy(np.load(cache))
                else:
                    if model is None: model = Wav2Vec2ForCTC.from_pretrained(str(args.model_dir), local_files_only=True, weights_only=True).eval()
                    inputs = processor(resample_poly(audio, 1, 3), sampling_rate=16000, return_tensors="pt")
                    with torch.inference_mode(): logp = torch.log_softmax(model(**inputs).logits, dim=-1)
                    if cache:
                        cache.parent.mkdir(parents=True, exist_ok=True)
                        np.save(cache, logp.numpy())
                tokens = torch.tensor([[vocab[c] for c in target]], dtype=torch.int64)
                aligned, scores = torchaudio.functional.forced_align(logp, tokens, blank=processor.tokenizer.pad_token_id)
                spans = torchaudio.functional.merge_tokens(aligned[0], scores[0].exp(), blank=processor.tokenizer.pad_token_id)
                if len(spans) != len(target): raise ValueError("CTC did not align every target token")
                chars = [{"text": c, "start": round(s.start*.02,6), "end": round(s.end*.02,6), "score": round(s.score,6)} for c,s in zip(target, spans)]
                cuts, qa = [0.], []
                for i, boundary in enumerate(boundaries):
                    candidate = pick_boundary(audio, sr, chars[boundary-1], chars[boundary], cuts[-1])
                    candidate.update(index=i+1, before=item["fragments"][i]["text"], after=item["fragments"][i+1]["text"])
                    qa.append(candidate)
                    cuts.append(candidate["cut"])
                cuts.append(len(audio)/sr)
                cues = [{"text": f["text"], "start": cuts[i], "end": cuts[i+1], "safeEnd": i == len(item["fragments"])-1 or qa[i]["status"] == "machine_gap_candidate"} for i,f in enumerate(item["fragments"])]
                if not all(c["end"] > c["start"] for c in cues): raise ValueError("Non-increasing cue points")
                sample_points = [round(x*sr) for x in cuts]
                reconstructed = np.concatenate([audio[a:b] for a,b in zip(sample_points, sample_points[1:])])
                if not np.array_equal(audio, reconstructed): raise ValueError("Cue segments do not reconstruct source PCM")
                windows = audio[:len(audio)//480*480].reshape(-1,480)
                rms = np.sqrt(np.mean(windows.astype(float)**2,axis=1))
                active = np.flatnonzero(rms > 10**(-45/20))
                tail_silence = len(audio)/sr - (int(active[-1])+1)*.01 if len(active) else len(audio)/sr
                terminal = {"lastAlignedTokenEnd":chars[-1]["end"],"remainingAudioSeconds":round(len(audio)/sr-chars[-1]["end"],4),"trailingLowEnergySeconds":round(max(0.,tail_silence),4),"last12TokenMeanConfidence":round(float(np.mean([c["score"] for c in chars[-12:]])),4),"durationAtCap":len(audio)/sr>=29.99}
                report["clips"][key] = {"sha256": gen["sha256"], "duration": len(audio)/sr, "cues": cues, "boundaries": qa, "alignmentText": target, "alignmentOnlyReplacements": replacements, "decodedText": processor.batch_decode(logp.argmax(-1))[0], "reviewNeeded": sum(q["status"]=="review_needed" for q in qa), "pcmReconstructionExact": True,"terminalCheck":terminal}
                report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
                print(f'ALIGNED {key}: {len(cues)} hard cues, {report["clips"][key]["reviewNeeded"]} boundaries need review', flush=True)
    publish_cues(report, args.assets)
    emit_typescript(report, generation, args.manifest)
    if args.watermark_model_dir:
        verify_watermarks(args, generation)
    print(f'COMPLETE: {len(report["clips"])} aligned clips', flush=True)

if __name__ == "__main__": main()
