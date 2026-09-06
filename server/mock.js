// mock 模式数据（未配置 LLM_API_KEY 时使用）。
// 保证 Demo 离线可跑；与真实模型输出结构完全一致（§11.9 字段缺失率必须为 0）。
// 前置概念遵循"宁缺毋滥、上限 2、禁上位词"（§11.3 / §11.5）。

const EXPLAIN_DB = {
  '梯度下降': {
    definition: '梯度下降是一种通过沿目标函数梯度的反方向迭代更新参数、逐步逼近函数最小值的优化算法。',
    in_context: '在这篇回答里，梯度下降是训练神经网络的主引擎：人类用反向传播算出梯度之后，就是靠它一步一步把损失降下来的。',
    prerequisites: ['梯度'],
    quiz_question: '你说梯度下降是沿负梯度方向走，那为什么是负的，而不是正的？',
    quiz_points: ['梯度指向上升最快方向', '反方向下降最快', '最小化损失'],
  },
  '梯度': {
    definition: '梯度是多元函数对各变量偏导数组成的向量，指向函数值上升最快的方向，模长为最大变化率。',
    in_context: '这篇回答用梯度把"损失对每个参数该往哪调"变成一个方向问题，梯度下降的名字也正来自它。',
    prerequisites: ['偏导数'],
    quiz_question: '梯度是一个数还是一个向量？它的方向有什么含义？',
    quiz_points: ['向量', '上升最快的方向'],
  },
  '偏导数': {
    definition: '偏导数是多元函数固定其余变量、只对其中一个变量求导得到的瞬时变化率。',
    in_context: '回答里把损失看成所有参数共同决定的曲面，偏导数就是单独看某一个参数拧动一点会怎样。',
    prerequisites: ['导数'],
    quiz_question: '求偏导数的时候，其他变量是被当成什么来处理的？',
    quiz_points: ['常数', '固定不变'],
  },
  '导数': {
    definition: '导数是函数在某一点处瞬时变化率的极限，几何上等于该点切线的斜率。',
    in_context: '这篇回答从最陡下降的方向讲起，而"方向"和"变化率"的说法，最朴素的原型就是导数。',
    prerequisites: [],
    quiz_question: '导数在几何上对应切线的什么量？',
    quiz_points: ['斜率'],
  },
  '反向传播': {
    definition: '反向传播是利用链式法则将输出层误差逐层回传、高效计算网络中每个参数梯度的算法。',
    in_context: '它是这篇回答的主角：没有反向传播，深层的神经网络根本算不起每个参数的梯度。',
    prerequisites: ['链式法则', '梯度下降'],
    quiz_question: '反向传播凭什么能一次算出几百万个参数的梯度，而不是一个个去扰动？',
    quiz_points: ['链式法则', '逐层复用中间结果'],
  },
  '链式法则': {
    definition: '链式法则是复合函数求导法则：复合函数的导数等于各层导数沿复合链条的乘积。',
    in_context: '神经网络本身就是一层套一层的复合函数，链式法则正是反向传播能"逐层回传"的数学依据。',
    prerequisites: ['导数'],
    quiz_question: '函数套函数时，整体的变化率怎么从各层的变化率得到？',
    quiz_points: ['相乘', '逐层求导'],
  },
  '损失函数': {
    definition: '损失函数是把模型预测与真实目标的差距映射为一个标量的函数，用于量化模型当前的好坏。',
    in_context: '回答里所有"下降"的对象都是它：训练被定义成在损失曲面上找低处。',
    prerequisites: [],
    quiz_question: '训练神经网络时，我们实际在最小化的对象是什么？',
    quiz_points: ['损失函数', '预测与真实的差距'],
  },
  '学习率': {
    definition: '学习率是梯度下降中每次沿负梯度方向更新参数时的步长系数。',
    in_context: '回答用它解释为什么训练会震荡或停滞：步子太大错过谷底，步子太小走得太慢。',
    prerequisites: ['梯度下降'],
    quiz_question: '学习率设得太大，训练时会发生什么现象？',
    quiz_points: ['震荡', '越过最小值'],
  },
  '过拟合': {
    definition: '过拟合是模型在训练数据上表现很好、却学到噪声与特例，导致在未见数据上泛化变差的现象。',
    in_context: '这篇回答把它当作"记住了却没学会"的典型，提醒读者损失降下去不等于真的学会了。',
    prerequisites: ['损失函数'],
    quiz_question: '训练损失很低但测试效果很差，说明模型怎么了？',
    quiz_points: ['过拟合', '记住噪声', '泛化差'],
  },
};

const PRESCAN_DB = {
  'article-backprop': ['反向传播', '链式法则', '损失函数', '梯度下降', '梯度', '偏导数', '学习率', '过拟合'],
  'article-gradient-descent': ['梯度下降', '梯度', '偏导数', '导数', '损失函数', '学习率'],
  'article-derivative': ['导数', '极限', '切线', '变化率'],
};

const generic = (concept) => ({
  definition: `${concept}：该领域的一个专业概念。（演示数据，配置 LLM_API_KEY 后由模型生成准确定义）`,
  in_context: `在你正在读的这篇回答里，「${concept}」是理解上下文论述的一块拼图。`,
  prerequisites: [],
  quiz_question: `你能用自己的话说说「${concept}」是干什么的吗？`,
  quiz_points: [concept],
});

export function mockExplain({ concept }) {
  const hit = EXPLAIN_DB[concept];
  const base = hit || generic(concept);
  return {
    is_concept: true,
    definition: base.definition,
    in_context: base.in_context,
    prerequisites: base.prerequisites,
    quiz_question: base.quiz_question,
    quiz_points: base.quiz_points,
    _mock: true,
  };
}

export function mockPrescan({ articleId }) {
  return { concepts: PRESCAN_DB[articleId] || ['梯度下降', '梯度', '导数'], _mock: true };
}

export function mockQuizJudge({ answer }) {
  const hasContent = String(answer || '').trim().length >= 4;
  return {
    verdict: hasContent ? 'partial' : 'wrong',
    feedback: hasContent
      ? '大方向对了。演示模式下我无法细判，配置模型密钥后看山会认真看你的回答。'
      : '这个回答太短啦，看山没法判断。试着多说一点你的理解。',
    _mock: true,
  };
}

// 演示用站内链接（搜索接口降级时使用，链接真实可跳知乎）
export function mockSearch({ query }) {
  const items = [
    { title: `如何通俗易懂地理解${query}？`, author: '知乎用户', url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`, excerpt: `关于「${query}」的高赞讨论（演示数据，配置搜索接口后替换为真实结果）。`, voteupCount: 1024, length: 800 },
  ];
  return { items, _mock: true };
}
