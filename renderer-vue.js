// ===== Vue3 恋爱转盘组件（全局构建版，无需打包工具）=====
(function () {
  if (typeof Vue === 'undefined') return;

  const { ref, computed } = Vue;

  const DEFAULT_OPTIONS = [
    { label: '吃火锅', emoji: '🍲' },
    { label: '看电影', emoji: '🎬' },
    { label: '一起做饭', emoji: '🍳' },
    { label: '去公园散步', emoji: '🌳' },
    { label: '喝奶茶', emoji: '🧋' },
    { label: '听你的', emoji: '💕' }
  ];
  const PALETTE = ['#ffd6e2', '#fff2d6', '#ffe3f1', '#fff9cf', '#e6f6ff', '#ffe8d9'];
  const TIPS = ['就决定是你啦～', '心动不如行动！', '今天也要甜甜的 💗', '听你的，都听你的～', '好呀好呀，安排上！'];
  const EASING = 'cubic-bezier(0.17, 0.67, 0.12, 0.99)';

  const LoveWheel = {
    props: {
      options: { type: Array, default: () => DEFAULT_OPTIONS },
      duration: { type: Number, default: 4200 }
    },
    emits: ['result'],
    setup(props, { emit }) {
      const items = computed(() =>
        props.options.map(o => (typeof o === 'string' ? { label: o, emoji: '💗' } : o))
      );
      const rotation = ref(0);
      const spinning = ref(false);
      const showResult = ref(false);
      const resultIndex = ref(0);
      const resultTip = ref(TIPS[0]);
      const segment = computed(() => 360 / items.value.length);

      const faceStyle = computed(() => {
        const seg = 360 / items.value.length;
        const stops = items.value
          .map((_, i) => `${PALETTE[i % PALETTE.length]} ${i * seg}deg ${(i + 1) * seg}deg`)
          .join(', ');
        return { background: `conic-gradient(from 0deg, ${stops})` };
      });

      const wheelStyle = computed(() => ({
        transform: `rotate(${rotation.value}deg)`,
        transition: spinning.value ? `transform ${props.duration}ms ${EASING}` : 'none'
      }));

      const labelStyle = (i) => {
        const angle = i * segment.value + segment.value / 2;
        return {
          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-112px) rotate(${-(angle + rotation.value)}deg)`,
          transition: spinning.value ? `transform ${props.duration}ms ${EASING}` : 'none'
        };
      };

      const resultItem = computed(() => items.value[resultIndex.value] || items.value[0]);

      const spin = () => {
        if (spinning.value) return;
        const n = items.value.length;
        const seg = 360 / n;
        const idx = Math.floor(Math.random() * n);
        const jitter = (Math.random() - 0.5) * (seg - 18);
        const targetOffset = (((360 - (idx * seg + seg / 2) + jitter) % 360) + 360) % 360;
        const turns = 5 + Math.floor(Math.random() * 3);
        const base = Math.ceil(rotation.value / 360) * 360;
        rotation.value = base + turns * 360 + targetOffset;

        spinning.value = true;
        showResult.value = false;

        window.setTimeout(() => {
          spinning.value = false;
          resultIndex.value = idx;
          resultTip.value = TIPS[Math.floor(Math.random() * TIPS.length)];
          showResult.value = true;
          emit('result', items.value[idx]);
        }, props.duration + 120);
      };

      const spinFromResult = () => {
        showResult.value = false;
        window.setTimeout(spin, 180);
      };
      const closeResult = () => { showResult.value = false; };

      return {
        items, spinning, showResult, resultItem, resultTip,
        faceStyle, wheelStyle, labelStyle, spin, spinFromResult, closeResult
      };
    },
    template: `
      <div class="love-wheel">
        <div class="wheel-stage">
          <div class="wheel-pointer"></div>
          <div class="wheel" :style="wheelStyle">
            <div class="wheel-face" :style="faceStyle"></div>
            <div v-for="(item, i) in items" :key="i" class="wheel-label" :style="labelStyle(i)">
              <span class="label-emoji">{{ item.emoji }}</span>
              <span class="label-text">{{ item.label }}</span>
            </div>
          </div>
          <button class="start-btn" :disabled="spinning" @click="spin">{{ spinning ? '转动中' : '开始' }}</button>
        </div>
        <transition name="pop">
          <div v-if="showResult" class="result-mask" @click.self="closeResult">
            <div class="result-card">
              <div class="result-hearts"><span>💕</span><span>✨</span><span>💗</span></div>
              <div class="result-emoji">{{ resultItem.emoji }}</div>
              <p class="result-tip">{{ resultTip }}</p>
              <h3 class="result-title">{{ resultItem.label }}</h3>
              <div class="result-actions">
                <button class="btn-again" @click="spinFromResult">再来一次</button>
                <button class="btn-ok" @click="closeResult">就这个啦</button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    `
  };

  window.mountLoveWheel = function (el, onResult) {
    if (!el) return;
    const App = {
      components: { LoveWheel },
      methods: {
        onResult(item) {
          if (typeof onResult === 'function') onResult(item);
        }
      },
      template: '<love-wheel :duration="4200" @result="onResult"></love-wheel>'
    };
    Vue.createApp(App).mount(el);
  };
})();
