// An opt-in studio soundscape. Everything is synthesized locally: no audio files,
// requests, or AudioContext exist until setEnabled(true) is called by the sound button.
export function createStudioSound() {
  const MAX_VOICES = 10;
  const voices = new Set();
  const ambienceNodes = new Set();
  const ambienceSources = new Set();
  const lastPlayed = new Map();
  let context = null;
  let master = null;
  let effectsBus = null;
  let ambienceBus = null;
  let airFilter = null;
  let whiteNoise = null;
  let brownNoise = null;
  let enabled = false;
  let mediaPlaying = false;
  let environment = 'day';
  let disposed = false;
  let accentTimer = 0;
  let suspendTimer = 0;
  let activation = 0;
  let playedCount = 0;
  let lastHover = -Infinity;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isVisible = () => typeof document === 'undefined' || !document.hidden;
  const isAudible = () => !disposed && enabled && !mediaPlaying && isVisible() && context?.state === 'running';

  function smooth(param, value, seconds = .12) {
    if (!context || !param) return;
    const now = context.currentTime;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function noiseBuffer(brown = false) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 2.4), context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = Math.random() * 2 - 1;
      if (brown) {
        previous = (previous + sample * .02) / 1.02;
        data[i] = previous * 3.3;
      } else data[i] = sample;
    }
    // A short crossfade makes the loop seam inaudible under the air filters.
    const seam = Math.min(2048, Math.floor(data.length / 8));
    for (let i = 0; i < seam; i++) {
      const mix = i / seam;
      data[data.length - seam + i] = data[data.length - seam + i] * (1 - mix) + data[i] * mix;
    }
    return buffer;
  }

  function addAmbienceNode(node) { ambienceNodes.add(node); return node; }
  function startAmbienceSource(source) {
    ambienceSources.add(source);
    source.onended = () => { ambienceSources.delete(source); try { source.disconnect(); } catch {} };
    source.start();
  }

  function buildAmbience() {
    ambienceBus = addAmbienceNode(context.createGain());
    ambienceBus.gain.value = environment === 'night' ? .042 : .064;
    ambienceBus.connect(master);

    const air = addAmbienceNode(context.createBufferSource());
    air.buffer = whiteNoise;
    air.loop = true;
    const highpass = addAmbienceNode(context.createBiquadFilter());
    highpass.type = 'highpass';
    highpass.frequency.value = 360;
    airFilter = addAmbienceNode(context.createBiquadFilter());
    airFilter.type = 'lowpass';
    airFilter.frequency.value = environment === 'night' ? 1050 : 1650;
    airFilter.Q.value = .45;
    const airGain = addAmbienceNode(context.createGain());
    airGain.gain.value = .14;
    air.connect(highpass).connect(airFilter).connect(airGain).connect(ambienceBus);
    startAmbienceSource(air);

    // Very slow air movement and two near-inaudible room resonances add space
    // without a musical loop competing with the submitted work.
    const drift = addAmbienceNode(context.createOscillator());
    const driftDepth = addAmbienceNode(context.createGain());
    drift.frequency.value = .071;
    driftDepth.gain.value = .017;
    drift.connect(driftDepth).connect(airGain.gain);
    startAmbienceSource(drift);
    [87.307, 130.813].forEach((frequency, index) => {
      const tone = addAmbienceNode(context.createOscillator());
      const toneGain = addAmbienceNode(context.createGain());
      tone.type = 'sine';
      tone.frequency.value = frequency;
      tone.detune.value = index ? 2 : -2;
      toneGain.gain.value = index ? .004 : .007;
      tone.connect(toneGain).connect(ambienceBus);
      startAmbienceSource(tone);
    });
  }

  function initialize() {
    if (context) return true;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass || disposed) return false;
    context = new AudioContextClass({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 16;
    compressor.ratio.value = 6;
    compressor.attack.value = .006;
    compressor.release.value = .16;
    const safetyGain = context.createGain();
    safetyGain.gain.value = .78;
    master.connect(compressor).connect(safetyGain).connect(context.destination);
    effectsBus = context.createGain();
    effectsBus.gain.value = .84;
    effectsBus.connect(master);
    whiteNoise = noiseBuffer();
    brownNoise = noiseBuffer(true);
    buildAmbience();
    return true;
  }

  function voice(pan = 0) {
    if (!isAudible() || voices.size >= MAX_VOICES) return null;
    const output = context.createGain();
    output.gain.value = 1;
    const nodes = new Set([output]);
    const sources = new Set();
    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(Number(pan) || 0, -.55, .55);
      nodes.add(panner);
      output.connect(panner).connect(effectsBus);
    } else output.connect(effectsBus);
    let finished = false;
    const entry = { output, nodes, sources, release };
    voices.add(entry);

    function release() {
      if (finished) return;
      finished = true;
      voices.delete(entry);
      for (const node of nodes) { try { node.disconnect(); } catch {} }
      nodes.clear();
      sources.clear();
    }
    function sourceEnded(source) {
      sources.delete(source);
      try { source.disconnect(); } catch {}
      if (!sources.size) release();
    }
    function registerSource(source, when, end) {
      sources.add(source);
      nodes.add(source);
      source.onended = () => sourceEnded(source);
      source.start(when);
      source.stop(end);
    }
    function envelope(peak, start, duration, attack = .008) {
      const gain = context.createGain();
      nodes.add(gain);
      const safeAttack = Math.min(attack, duration * .3);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + safeAttack);
      gain.gain.exponentialRampToValueAtTime(.00001, start + Math.max(safeAttack + .002, duration));
      gain.connect(output);
      return gain;
    }
    function tone({ frequency = 180, endFrequency = frequency, duration = .18, delay = 0, gain = .035, attack = .008, type = 'sine' } = {}) {
      const source = context.createOscillator();
      const start = context.currentTime + .005 + delay;
      source.type = type;
      source.frequency.setValueAtTime(frequency, start);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
      source.connect(envelope(gain, start, duration, attack));
      registerSource(source, start, start + duration + .035);
    }
    function texture({ frequency = 1000, lowpass = 3800, highpass = 90, q = .7, duration = .15, delay = 0, gain = .08, attack = .012, brown = false } = {}) {
      const source = context.createBufferSource();
      source.buffer = brown ? brownNoise : whiteNoise;
      const start = context.currentTime + .005 + delay;
      const bandpass = context.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = frequency;
      bandpass.Q.value = q;
      const low = context.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = lowpass;
      const high = context.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = highpass;
      nodes.add(bandpass); nodes.add(low); nodes.add(high);
      source.playbackRate.value = .92 + Math.random() * .13;
      source.connect(bandpass).connect(low).connect(high).connect(envelope(gain, start, duration, attack));
      registerSource(source, start, start + duration + .035);
    }
    playedCount++;
    return { tone, texture };
  }

  function paper(v, delay = 0, level = 1) {
    v.texture({ frequency: 1700, lowpass: 4100, duration: .24, delay, gain: .095 * level, attack: .035 });
    v.texture({ frequency: 2450, lowpass: 4700, duration: .13, delay: delay + .075, gain: .055 * level, attack: .02 });
    v.tone({ frequency: 190, endFrequency: 145, duration: .07, delay, gain: .012 * level });
  }

  function play(kind = 'open', category, options = {}) {
    if (typeof category === 'object' && category) { options = category; category = undefined; }
    if (!isAudible()) return false;
    const now = context.currentTime;
    if (kind === 'hover') {
      if (now - lastHover < .22) return false;
      lastHover = now;
    } else {
      // Bound rapid repeated activation without blocking ordinary navigation.
      const key = `${kind}:${category || ''}`;
      if (now - (lastPlayed.get(key) ?? -Infinity) < .075) return false;
      lastPlayed.set(key, now);
      if (lastPlayed.size > 30) lastPlayed.delete(lastPlayed.keys().next().value);
    }
    const v = voice(options.pan);
    if (!v) return false;
    if (kind === 'hover') {
      v.texture({ frequency: 650, lowpass: 1800, duration: .045, gain: .045, attack: .005, brown: true });
      v.tone({ frequency: 235, endFrequency: 190, duration: .045, gain: .014, attack: .006 });
    } else if (kind === 'copy' || kind === 'success' || kind === 'enable') {
      v.tone({ frequency: 523.25, duration: .24, gain: .023, attack: .012 });
      v.tone({ frequency: 659.25, duration: .3, delay: .075, gain: .018, attack: .018 });
      v.tone({ frequency: 1046.5, duration: .12, delay: .075, gain: .004, attack: .012 });
    } else if (kind === 'close') {
      v.texture({ frequency: 470, lowpass: 1500, duration: .19, gain: .09, attack: .028, brown: true });
      v.tone({ frequency: 140, endFrequency: 93, duration: .14, delay: .08, gain: .044, attack: .007 });
      v.texture({ frequency: 900, lowpass: 2400, duration: .05, delay: .09, gain: .038, attack: .004 });
    } else if (kind === 'environment' || kind === 'light' || kind === 'lighting') {
      v.texture({ frequency: 850, lowpass: 2600, duration: .42, gain: .082, attack: .12, brown: true });
      v.tone({ frequency: 280, endFrequency: 190, duration: .065, gain: .024, attack: .005 });
      v.tone({ frequency: environment === 'night' ? 196 : 261.63, duration: .46, delay: .09, gain: .014, attack: .06 });
    } else if (kind === 'ambient') {
      if (environment === 'night') {
        v.tone({ frequency: 523.25, duration: 1.35, gain: .007, attack: .055 });
        v.tone({ frequency: 784, duration: .95, delay: .14, gain: .0038, attack: .05 });
      } else paper(v, 0, .18);
    } else {
      // The warm drawer movement anchors every opening in the physical studio.
      v.texture({ frequency: 380, lowpass: 1600, duration: .19, gain: .11, attack: .025, brown: true });
      v.tone({ frequency: 118, endFrequency: 86, duration: .15, gain: .039, attack: .008 });
      if (category === 'Infographics' || category === 'Articles' || category === 'Process') {
        paper(v, .035);
      } else if (category === 'AI images') {
        // A small camera's two-part shutter, softened by its enclosure.
        v.texture({ frequency: 2300, highpass: 600, lowpass: 4600, duration: .065, delay: .035, gain: .13, attack: .003 });
        v.texture({ frequency: 1450, highpass: 350, lowpass: 3200, duration: .065, delay: .115, gain: .085, attack: .004 });
        v.tone({ frequency: 390, endFrequency: 210, duration: .06, delay: .035, gain: .025, attack: .004 });
      } else if (category === 'AI songs') {
        // A little vinyl friction followed by an understated warm major chord.
        v.texture({ frequency: 1050, lowpass: 2600, duration: .19, delay: .03, gain: .065, attack: .018 });
        [130.813, 164.814, 195.998].forEach((frequency, index) => v.tone({ frequency, duration: .52, delay: .07 + index * .018, gain: .018, attack: .035 }));
      } else if (category === 'Explainer films') {
        [.035, .09, .15].forEach((delay, index) => v.texture({ frequency: 950 + index * 170, lowpass: 2850, duration: .045, delay, gain: .075 - index * .012, attack: .004 }));
        v.tone({ frequency: 180, endFrequency: 120, duration: .12, delay: .035, gain: .018 });
      } else if (category === 'Podcasts') {
        v.texture({ frequency: 520, lowpass: 1300, duration: .11, delay: .035, gain: .1, attack: .012, brown: true });
        v.tone({ frequency: 196, endFrequency: 164, duration: .36, delay: .04, gain: .029, attack: .018 });
        v.tone({ frequency: 392, endFrequency: 328, duration: .22, delay: .04, gain: .006, attack: .018 });
      } else {
        v.texture({ frequency: 920, lowpass: 2300, duration: .075, delay: .045, gain: .055, attack: .009 });
        v.tone({ frequency: 260, endFrequency: 185, duration: .09, delay: .045, gain: .018 });
      }
    }
    return true;
  }

  function clearAccent() { clearTimeout(accentTimer); accentTimer = 0; }
  function scheduleAccent() {
    clearAccent();
    if (!isAudible()) return;
    accentTimer = setTimeout(() => {
      accentTimer = 0;
      if (isAudible()) play('ambient', undefined, { pan: (Math.random() - .5) * .6 });
      scheduleAccent();
    }, 28000 + Math.random() * 24000);
  }

  function silenceVoices() {
    if (!context) return;
    for (const entry of voices) {
      smooth(entry.output.gain, 0, .035);
      for (const source of entry.sources) { try { source.stop(context.currentTime + .04); } catch {} }
    }
  }

  function updateMix() {
    if (!context) return;
    smooth(master.gain, isAudible() ? 1 : 0, mediaPlaying ? .055 : .3);
    if (isAudible()) scheduleAccent();
    else { clearAccent(); silenceVoices(); }
  }

  async function setEnabled(value) {
    enabled = Boolean(value) && !disposed;
    const token = ++activation;
    clearTimeout(suspendTimer);
    suspendTimer = 0;
    if (!enabled) {
      updateMix();
      if (context?.state === 'running') suspendTimer = setTimeout(() => {
        suspendTimer = 0;
        if (!enabled && !disposed) context.suspend().catch(() => {});
      }, 350);
      return false;
    }
    try {
      if (!initialize()) { enabled = false; return false; }
      if (context.state === 'suspended' && isVisible()) await context.resume();
      if (token !== activation || disposed) {
        if (!enabled && !disposed && context.state === 'running') await context.suspend();
        return enabled;
      }
      if (!isVisible() && context.state === 'running') await context.suspend();
      updateMix();
      return enabled;
    } catch {
      enabled = false;
      updateMix();
      return false;
    }
  }

  function setEnvironment(value) {
    environment = value === 'night' ? 'night' : 'day';
    if (!context) return;
    smooth(ambienceBus.gain, environment === 'night' ? .042 : .064, 1.5);
    smooth(airFilter.frequency, environment === 'night' ? 1050 : 1650, 1.5);
  }

  function setMediaPlaying(value) {
    mediaPlaying = Boolean(value);
    updateMix();
  }

  async function onVisibilityChange() {
    if (!context || disposed) return;
    if (!isVisible()) {
      clearAccent();
      silenceVoices();
      try { if (context.state === 'running') await context.suspend(); } catch {}
      // A visibility event can race a quick return to the tab.
      if (!disposed && enabled && isVisible()) {
        try { if (context.state === 'suspended') await context.resume(); } catch {}
        updateMix();
      }
    } else if (enabled) {
      try { if (context.state === 'suspended') await context.resume(); } catch {}
      updateMix();
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);

  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    activation++;
    clearAccent();
    clearTimeout(suspendTimer);
    suspendTimer = 0;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const entry of voices) {
      for (const source of entry.sources) { try { source.stop(); } catch {} }
      entry.release();
    }
    for (const source of ambienceSources) { try { source.stop(); } catch {} }
    ambienceSources.clear();
    for (const node of ambienceNodes) { try { node.disconnect(); } catch {} }
    ambienceNodes.clear();
    lastPlayed.clear();
    whiteNoise = brownNoise = null;
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }

  function getDiagnostics() {
    return {
      enabled, environment, mediaPlaying, visible: isVisible(), disposed,
      contextCreated: Boolean(context), contextState: context?.state || 'uninitialized',
      activeVoices: voices.size, maxVoices: MAX_VOICES,
      ambienceNodes: ambienceNodes.size, ambienceSources: ambienceSources.size,
      accentScheduled: Boolean(accentTimer), playedCount
    };
  }

  return { setEnabled, play, setEnvironment, setMediaPlaying, dispose, getDiagnostics };
}
