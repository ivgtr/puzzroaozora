# Audio generation and alignment attribution

## Irodori-TTS

- Author: Aratako
- Code: https://github.com/Aratako/Irodori-TTS/tree/89f9d8fbd4d51ea019867ee1197725ede1df13c5
- Model: https://huggingface.co/Aratako/Irodori-TTS-v4.1-Small/tree/2b28324dc263ed5e6638b3cf3dd94c82ead07b4b
- Model and code license: MIT; full notice in `Irodori-MIT.txt`
- Codec: https://huggingface.co/Aratako/Semantic-DACVAE-Japanese-32dim/tree/47376ee24834d7a05a48ebabfe3cde29b3c5e214
- Codec model license: MIT; codec implementation: DACVAE (Apache-2.0)
- Automatic watermarking: Sony SilentCipher (MIT), https://github.com/sony/silentcipher

The Irodori model card also prohibits unconsented impersonation and misleading synthetic speech. All narrators here are fictional synthetic voices. Caption-designed speech may coincidentally resemble a real voice; no specific individual was selected or imitated. These recordings are disclosed as synthetic narration in the application.

## Forced alignment

- Model: Jonatas Grosman's Japanese XLSR-53 Wav2Vec2 CTC model
- Snapshot: https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-japanese/tree/cf031e020336460d15a417eba710bbc5bb43be9a
- Model-card license: Apache-2.0
- Alignment API: PyTorch/TorchAudio `forced_align` and `merge_tokens`
- No model weights are distributed in this repository

## Literary sources

Aozora Bunko source URLs are preserved per passage in `requests.json`. The source text remains distinct from speech-only reading overrides and alignment-only vocabulary normalization. Source bibliographic credits remain in the game’s completion view.
