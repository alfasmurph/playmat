/**
 * A stand-in for the Web Audio API, enough to build graphs in tests: every node records its kind, its connections
 * and the times it was started and stopped; params record their automation. Nothing makes a sound.
 *   const ctx = new FakeAudioContext(); playRecipe(ctx as unknown as AudioContext, ctx.destination, recipe, 1);
 *   ctx.sources() // the started oscillators and buffer sources
 */

export class FakeParam {
  value: number;
  events: [method: string, value: number, time: number][] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number) {
    this.events.push(['set', value, time]);
    return this;
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(['linear', value, time]);
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError('exponential ramp to a value that is not positive');
    this.events.push(['exponential', value, time]);
    return this;
  }

  setTargetAtTime(value: number, time: number) {
    this.events.push(['target', value, time]);
    return this;
  }
}

export class FakeNode {
  readonly outputs: (FakeNode | FakeParam)[] = [];
  started: [when: number, offset?: number, duration?: number] | null = null;
  stoppedAt: number | null = null;
  disconnected = false;
  [param: string]: unknown;

  constructor(readonly kind: string, readonly ctx: FakeAudioContext, params: Record<string, number> = {}) {
    for (const [name, value] of Object.entries(params)) this[name] = new FakeParam(value);
  }

  param(name: string): FakeParam {
    return this[name] as FakeParam;
  }

  connect<T extends FakeNode | FakeParam>(target: T): T {
    this.outputs.push(target);
    return target;
  }

  disconnect() {
    this.disconnected = true;
  }

  start(when = 0, offset?: number, duration?: number) {
    this.started = [when, offset, duration];
  }

  stop(when = 0) {
    this.stoppedAt = when;
  }
}

export class FakeBuffer {
  readonly data: Float32Array[];

  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration() {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number) {
    return this.data[channel];
  }
}

export class FakeAudioContext {
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  sampleRate = 8000;
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  /** what decodeAudioData makes of the bytes it is given (by default a one-second buffer) */
  decode: (data: ArrayBuffer) => Promise<FakeBuffer> = async () => new FakeBuffer(1, this.sampleRate, this.sampleRate);

  constructor() {
    this.destination = new FakeNode('destination', this);
  }

  private node(type: string, params: Record<string, number> = {}) {
    const node = new FakeNode(type, this, params);
    this.nodes.push(node);
    return node;
  }

  createGain() {
    return this.node('gain', { gain: 1 });
  }

  createDelay() {
    return this.node('delay', { delayTime: 0 });
  }

  createBiquadFilter() {
    return this.node('biquad', { frequency: 350, Q: 1, gain: 0 });
  }

  createDynamicsCompressor() {
    return this.node('compressor', { threshold: -24, ratio: 12, attack: 0.003, release: 0.25, knee: 30 });
  }

  createWaveShaper() {
    return this.node('waveshaper');
  }

  createOscillator() {
    return this.node('oscillator', { frequency: 440, detune: 0 });
  }

  createBufferSource() {
    return this.node('bufferSource', { playbackRate: 1, detune: 0 });
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeBuffer(channels, length, sampleRate);
  }

  decodeAudioData(data: ArrayBuffer) {
    return this.decode(data);
  }

  async resume() {
    this.state = 'running';
  }

  /** the nodes of a kind ('gain', 'oscillator', ...) */
  of(kind: string) {
    return this.nodes.filter((node) => node.kind === kind);
  }

  /** the sources that were started */
  sources() {
    return this.nodes.filter((node) => (node.kind === 'oscillator' || node.kind === 'bufferSource') && node.started);
  }
}
