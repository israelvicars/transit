# Suite baseline (M0, 2026-10-16, main @ suite-plan)
- `npm test`: pass (normalize tests, 11 contract tests, plugin SKILL.md up to date)
- `npm run verify`: all checks passed (double render byte-identical, freeze/black gates)
- `npm run test:ui`: all UI tests pass; zero network requests (plain + contracts)
- out/otel/anim.mp4 sha256 `223590ce6b1a30497d4ae0f3dae860fbaca1c45cd291f450a8fa091c4c2f45ff` (system ffmpeg 9.0.2, Homebrew)
- out/otel/anim.gif sha256 `bed864e9934b38cb7d9e9eb6e87f8d69cdfbff60f7b4739b0ed02eb56b47fedc` (system ffmpeg 9.0.2)

## 2026-10-18: encoder pinned
ffmpeg now comes from the pinned `ffmpeg-static` 5.3.0 dependency (ffmpeg 6.0) before any system ffmpeg. The frames are
unchanged (request film hash `86d08fd5fe208fb0`, same as before), but the encoder differs, so the files hash differently:
- out/otel/anim.mp4 sha256 `f4417aac2297a70b4e025d3440d68904f0dcf1c92ce88ff9685fb6acb6ca89f9` (ffmpeg-static 5.3.0; macOS arm64, Playwright chromium-headless-shell 156.0.8078.4)
- out/otel/anim.gif sha256 `90d074e3fd1605b5a79fbfb2427c68f1d3240a2cc6c0fa4ba3f7ac4724524213`
- The old hashes still reproduce with `TRANSIT_FFMPEG=/opt/homebrew/bin/ffmpeg` (ffmpeg 9.0.2).
