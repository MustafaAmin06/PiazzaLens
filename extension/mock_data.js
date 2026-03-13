// ============================================================
// PiazzaLens — Mock Data Layer
// Provides realistic Piazza data for hackathon demo
// ============================================================

const MOCK_DATA = {
  // ---- Course Info ----
  course: {
    id: "cs229_spring2026",
    name: "CS229: Machine Learning",
    professor: "Prof. Smith",
    students: 187,
    tas: ["Maria Chen", "James Park", "Aisha Johnson"]
  },

  // ---- Piazza Posts (50 posts across 8 lectures) ----
  posts: [
    // Lecture 1: Linear Regression
    { id: 1, title: "Confused about the cost function in linear regression", body: "Why do we use squared error instead of absolute error? I don't understand the mathematical reasoning.", author: "Alex T.", lecture: 1, topic: "Linear Regression", timestamp: "2026-02-01T10:23:00Z", upvotes: 12, resolved: true, tags: ["linear-regression", "cost-function"] },
    { id: 2, title: "How does gradient descent converge?", body: "I understand the formula but I'm confused about when it converges and how learning rate affects this.", author: "Jordan M.", lecture: 1, topic: "Linear Regression", timestamp: "2026-02-01T14:15:00Z", upvotes: 8, resolved: true, tags: ["gradient-descent", "convergence"] },
    { id: 3, title: "Normal equation vs gradient descent?", body: "When should we use the normal equation versus gradient descent? Are there performance tradeoffs?", author: "Sam K.", lecture: 1, topic: "Linear Regression", timestamp: "2026-02-02T09:45:00Z", upvotes: 15, resolved: true, tags: ["normal-equation", "gradient-descent"] },
    { id: 4, title: "Feature scaling question", body: "Why do we need to normalize features? What happens if we don't?", author: "Priya R.", lecture: 1, topic: "Linear Regression", timestamp: "2026-02-02T16:30:00Z", upvotes: 6, resolved: false, tags: ["feature-scaling", "normalization"] },
    { id: 5, title: "Learning rate too high", body: "My gradient descent is diverging. How do I choose the right learning rate?", author: "Chris L.", lecture: 1, topic: "Linear Regression", timestamp: "2026-02-03T11:00:00Z", upvotes: 19, resolved: true, tags: ["learning-rate", "gradient-descent"] },
    { id: 6, title: "Vectorized implementation of gradient descent", body: "How do I implement gradient descent without for loops using numpy?", author: "Taylor W.", lecture: 1, topic: "Linear Regression", timestamp: "2026-02-03T15:20:00Z", upvotes: 7, resolved: true, tags: ["vectorization", "numpy"] },

    // Lecture 2: Logistic Regression
    { id: 7, title: "Why sigmoid function for logistic regression?", body: "Why can't we just use a linear function and threshold at 0.5?", author: "Alex T.", lecture: 2, topic: "Logistic Regression", timestamp: "2026-02-05T09:00:00Z", upvotes: 11, resolved: true, tags: ["sigmoid", "logistic-regression"] },
    { id: 8, title: "Decision boundary visualization", body: "How do I plot the decision boundary for a 2-feature logistic regression model?", author: "Morgan F.", lecture: 2, topic: "Logistic Regression", timestamp: "2026-02-05T14:30:00Z", upvotes: 5, resolved: true, tags: ["decision-boundary", "visualization"] },
    { id: 9, title: "Multiclass classification confusion", body: "I'm confused about one-vs-all vs softmax. Which should we use for Problem Set 2?", author: "Jordan M.", lecture: 2, topic: "Logistic Regression", timestamp: "2026-02-06T10:15:00Z", upvotes: 14, resolved: false, tags: ["multiclass", "softmax", "one-vs-all"] },
    { id: 10, title: "Regularization in logistic regression", body: "When and why do we add regularization? How does it prevent overfitting?", author: "Priya R.", lecture: 2, topic: "Logistic Regression", timestamp: "2026-02-06T16:45:00Z", upvotes: 9, resolved: true, tags: ["regularization", "overfitting"] },
    { id: 11, title: "Log-loss vs MSE for classification", body: "Why can't we use mean squared error for logistic regression?", author: "Casey N.", lecture: 2, topic: "Logistic Regression", timestamp: "2026-02-07T08:30:00Z", upvotes: 13, resolved: true, tags: ["log-loss", "cost-function"] },

    // Lecture 3: Neural Networks
    { id: 12, title: "Backpropagation chain rule", body: "I can't follow the chain rule derivation for backprop. Can someone explain step by step?", author: "Alex T.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-10T09:00:00Z", upvotes: 22, resolved: false, tags: ["backpropagation", "chain-rule"] },
    { id: 13, title: "How many hidden layers to use?", body: "Is there a rule of thumb for choosing the number of hidden layers and neurons?", author: "Riley B.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-10T13:00:00Z", upvotes: 16, resolved: true, tags: ["architecture", "hidden-layers"] },
    { id: 14, title: "Vanishing gradient problem", body: "My deep network isn't learning. I think it's vanishing gradients. How do I fix this?", author: "Jordan M.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-11T10:30:00Z", upvotes: 18, resolved: true, tags: ["vanishing-gradient", "relu"] },
    { id: 15, title: "ReLU vs Sigmoid activation", body: "Why has ReLU replaced sigmoid in modern networks? What are the tradeoffs?", author: "Sam K.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-11T15:00:00Z", upvotes: 10, resolved: true, tags: ["activation-functions", "relu", "sigmoid"] },
    { id: 16, title: "Weight initialization strategies", body: "What's Xavier initialization and why does it matter?", author: "Morgan F.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-12T09:45:00Z", upvotes: 7, resolved: true, tags: ["weight-init", "xavier"] },
    { id: 17, title: "Batch normalization explanation", body: "Can someone explain batch normalization intuitively? The paper is dense.", author: "Taylor W.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-12T14:15:00Z", upvotes: 20, resolved: false, tags: ["batch-norm"] },
    { id: 18, title: "Dropout regularization", body: "How does randomly dropping neurons help prevent overfitting?", author: "Chris L.", lecture: 3, topic: "Neural Networks", timestamp: "2026-02-13T11:00:00Z", upvotes: 12, resolved: true, tags: ["dropout", "regularization"] },

    // Lecture 4: SVMs
    { id: 19, title: "Kernel trick intuition", body: "I don't understand how the kernel trick maps to higher dimensions without explicitly computing them.", author: "Alex T.", lecture: 4, topic: "SVMs", timestamp: "2026-02-17T09:30:00Z", upvotes: 17, resolved: false, tags: ["kernel-trick", "svm"] },
    { id: 20, title: "Hard margin vs soft margin SVM", body: "When would you ever use hard margin? Soft margin seems strictly better.", author: "Priya R.", lecture: 4, topic: "SVMs", timestamp: "2026-02-17T14:00:00Z", upvotes: 8, resolved: true, tags: ["svm", "margin"] },
    { id: 21, title: "SVM vs logistic regression", body: "When should I use SVM instead of logistic regression? They seem similar.", author: "Casey N.", lecture: 4, topic: "SVMs", timestamp: "2026-02-18T10:00:00Z", upvotes: 11, resolved: true, tags: ["svm", "logistic-regression", "comparison"] },
    { id: 22, title: "RBF kernel parameters", body: "How do I tune gamma and C for the RBF kernel? I keep getting bad results.", author: "Jordan M.", lecture: 4, topic: "SVMs", timestamp: "2026-02-18T15:30:00Z", upvotes: 9, resolved: false, tags: ["rbf-kernel", "hyperparameters"] },

    // Lecture 5: Clustering & Unsupervised Learning
    { id: 23, title: "K-means choosing K", body: "How do I know how many clusters to choose? The elbow method doesn't always work.", author: "Alex T.", lecture: 5, topic: "Clustering", timestamp: "2026-02-24T09:00:00Z", upvotes: 21, resolved: false, tags: ["k-means", "elbow-method"] },
    { id: 24, title: "K-means vs DBSCAN", body: "When is DBSCAN better than K-means? What about non-spherical clusters?", author: "Sam K.", lecture: 5, topic: "Clustering", timestamp: "2026-02-24T13:30:00Z", upvotes: 14, resolved: true, tags: ["k-means", "dbscan", "comparison"] },
    { id: 25, title: "PCA dimensionality reduction", body: "How many principal components should I keep? What's the explained variance threshold?", author: "Riley B.", lecture: 5, topic: "Clustering", timestamp: "2026-02-25T10:15:00Z", upvotes: 16, resolved: false, tags: ["pca", "dimensionality-reduction"] },
    { id: 26, title: "K-means initialization problem", body: "My K-means gives different results every time. Is this normal?", author: "Morgan F.", lecture: 5, topic: "Clustering", timestamp: "2026-02-25T15:00:00Z", upvotes: 10, resolved: true, tags: ["k-means", "initialization"] },
    { id: 27, title: "Hierarchical clustering when?", body: "When would I use hierarchical clustering over K-means?", author: "Taylor W.", lecture: 5, topic: "Clustering", timestamp: "2026-02-26T09:30:00Z", upvotes: 6, resolved: true, tags: ["hierarchical-clustering"] },
    { id: 28, title: "Gaussian mixture models", body: "How are GMMs different from K-means? When would soft clustering be preferred?", author: "Priya R.", lecture: 5, topic: "Clustering", timestamp: "2026-02-26T14:00:00Z", upvotes: 13, resolved: false, tags: ["gmm", "soft-clustering"] },
    { id: 29, title: "Silhouette score interpretation", body: "What does a silhouette score of 0.4 mean? Is that good or bad?", author: "Chris L.", lecture: 5, topic: "Clustering", timestamp: "2026-02-27T11:00:00Z", upvotes: 8, resolved: true, tags: ["silhouette-score", "evaluation"] },

    // Lecture 6: Deep Learning / CNNs
    { id: 30, title: "Convolution operation confusion", body: "I don't understand how the convolution filter slides over the image. Can someone draw it out?", author: "Alex T.", lecture: 6, topic: "Deep Learning", timestamp: "2026-03-03T09:00:00Z", upvotes: 24, resolved: false, tags: ["cnn", "convolution"] },
    { id: 31, title: "Max pooling vs average pooling", body: "Why is max pooling more common? When would average pooling be better?", author: "Jordan M.", lecture: 6, topic: "Deep Learning", timestamp: "2026-03-03T14:00:00Z", upvotes: 11, resolved: true, tags: ["pooling", "cnn"] },
    { id: 32, title: "Transfer learning with pretrained models", body: "How do I use a pretrained ResNet for my own dataset? Do I freeze layers?", author: "Sam K.", lecture: 6, topic: "Deep Learning", timestamp: "2026-03-04T10:30:00Z", upvotes: 19, resolved: true, tags: ["transfer-learning", "resnet"] },
    { id: 33, title: "Data augmentation techniques", body: "What augmentations are safe for medical images? I don't want to change the diagnosis.", author: "Priya R.", lecture: 6, topic: "Deep Learning", timestamp: "2026-03-04T15:45:00Z", upvotes: 7, resolved: false, tags: ["data-augmentation", "medical"] },
    { id: 34, title: "GPU memory out of memory", body: "I keep getting CUDA out of memory errors. How do I reduce memory usage?", author: "Casey N.", lecture: 6, topic: "Deep Learning", timestamp: "2026-03-05T09:15:00Z", upvotes: 15, resolved: true, tags: ["gpu", "memory", "cuda"] },
    { id: 35, title: "Batch size effect on training", body: "Why does larger batch size sometimes hurt generalization?", author: "Riley B.", lecture: 6, topic: "Deep Learning", timestamp: "2026-03-05T13:30:00Z", upvotes: 12, resolved: true, tags: ["batch-size", "generalization"] },

    // Lecture 7: NLP / Transformers
    { id: 36, title: "Attention mechanism intuition", body: "I watched 3 videos and still don't understand self-attention. Help!", author: "Alex T.", lecture: 7, topic: "NLP", timestamp: "2026-03-10T09:00:00Z", upvotes: 28, resolved: false, tags: ["attention", "transformers"] },
    { id: 37, title: "Word embeddings vs one-hot encoding", body: "Why are word embeddings better than one-hot? What information do they capture?", author: "Taylor W.", lecture: 7, topic: "NLP", timestamp: "2026-03-10T14:00:00Z", upvotes: 9, resolved: true, tags: ["embeddings", "word2vec"] },
    { id: 38, title: "BERT vs GPT architecture", body: "What's the difference between BERT and GPT? When do I use each?", author: "Morgan F.", lecture: 7, topic: "NLP", timestamp: "2026-03-11T10:00:00Z", upvotes: 20, resolved: true, tags: ["bert", "gpt", "comparison"] },
    { id: 39, title: "Tokenization strategies", body: "BPE vs WordPiece vs SentencePiece — which tokenizer should I use?", author: "Jordan M.", lecture: 7, topic: "NLP", timestamp: "2026-03-11T15:30:00Z", upvotes: 6, resolved: true, tags: ["tokenization", "bpe"] },
    { id: 40, title: "Fine-tuning BERT for classification", body: "How many epochs should I fine-tune BERT? My model keeps overfitting.", author: "Chris L.", lecture: 7, topic: "NLP", timestamp: "2026-03-12T09:30:00Z", upvotes: 14, resolved: false, tags: ["fine-tuning", "bert", "overfitting"] },

    // Lecture 8: Reinforcement Learning
    { id: 41, title: "Q-learning vs SARSA", body: "What's the practical difference? When would SARSA give better results?", author: "Sam K.", lecture: 8, topic: "Reinforcement Learning", timestamp: "2026-03-12T14:00:00Z", upvotes: 10, resolved: true, tags: ["q-learning", "sarsa"] },
    { id: 42, title: "Exploration vs exploitation", body: "How do I balance exploration and exploitation? Epsilon-greedy seems too simple.", author: "Alex T.", lecture: 8, topic: "Reinforcement Learning", timestamp: "2026-03-13T09:00:00Z", upvotes: 13, resolved: false, tags: ["exploration", "epsilon-greedy"] },
    { id: 43, title: "Reward shaping problems", body: "My RL agent is gaming the reward function. How do I design better rewards?", author: "Priya R.", lecture: 8, topic: "Reinforcement Learning", timestamp: "2026-03-13T10:00:00Z", upvotes: 8, resolved: false, tags: ["reward-shaping", "rl"] },

    // General / Assignment questions
    { id: 44, title: "PS3 deadline extension?", body: "Is there any possibility of extending the PS3 deadline? Many students are struggling.", author: "Riley B.", lecture: null, topic: "Logistics", timestamp: "2026-03-06T09:00:00Z", upvotes: 32, resolved: true, tags: ["logistics", "deadline"] },
    { id: 45, title: "Office hours schedule change", body: "Will office hours move to accommodate the midterm review?", author: "Casey N.", lecture: null, topic: "Logistics", timestamp: "2026-03-07T11:00:00Z", upvotes: 5, resolved: true, tags: ["logistics", "office-hours"] },
    { id: 46, title: "Midterm study guide", body: "Is there a study guide or list of topics for the midterm?", author: "Taylor W.", lecture: null, topic: "Logistics", timestamp: "2026-03-08T10:00:00Z", upvotes: 27, resolved: true, tags: ["midterm", "study-guide"] },
    { id: 47, title: "Python environment setup issues", body: "I can't install tensorflow on my M1 Mac. Has anyone gotten it working?", author: "Morgan F.", lecture: null, topic: "Technical", timestamp: "2026-02-20T09:00:00Z", upvotes: 18, resolved: true, tags: ["setup", "tensorflow", "mac"] },
    { id: 48, title: "Colab GPU not available", body: "Google Colab won't give me a GPU runtime. Any alternatives?", author: "Jordan M.", lecture: null, topic: "Technical", timestamp: "2026-03-01T14:00:00Z", upvotes: 11, resolved: true, tags: ["colab", "gpu"] },
    { id: 49, title: "Assignment 2 grading question", body: "I lost points on Q3 but my answer matches the solution. Can a TA review?", author: "Chris L.", lecture: null, topic: "Grading", timestamp: "2026-03-09T16:00:00Z", upvotes: 3, resolved: false, tags: ["grading", "regrade"] },
    { id: 50, title: "Extra credit opportunities?", body: "Are there any extra credit opportunities this semester?", author: "Alex T.", lecture: null, topic: "Logistics", timestamp: "2026-03-10T10:00:00Z", upvotes: 14, resolved: false, tags: ["logistics", "extra-credit"] }
  ],

  // ---- Pre-computed Question Clusters ----
  clusters: [
    {
      topic: "Gradient Descent & Optimization",
      count: 17,
      exampleQuestions: [
        "How does gradient descent converge?",
        "Learning rate too high — diverging",
        "Why does larger batch size sometimes hurt generalization?"
      ],
      suggestedAction: "Review gradient descent convergence theory with visual animations. Provide a learning rate selection guide and interactive demo.",
      severity: "high"
    },
    {
      topic: "Neural Network Architecture & Training",
      count: 14,
      exampleQuestions: [
        "How many hidden layers to use?",
        "Vanishing gradient problem",
        "Batch normalization explanation"
      ],
      suggestedAction: "Dedicate a lecture section to practical architecture decisions. Show side-by-side training curves with different architectures.",
      severity: "high"
    },
    {
      topic: "Backpropagation & Chain Rule",
      count: 11,
      exampleQuestions: [
        "Backpropagation chain rule step-by-step",
        "Derivative step in backprop",
        "Weight initialization strategies"
      ],
      suggestedAction: "Walk through backprop computation graph on whiteboard. Provide a step-by-step numerical example students can follow.",
      severity: "medium"
    },
    {
      topic: "Model Selection & Comparison",
      count: 9,
      exampleQuestions: [
        "SVM vs logistic regression",
        "K-means vs DBSCAN",
        "BERT vs GPT architecture"
      ],
      suggestedAction: "Create a comparison table handout. Discuss when to use each algorithm with decision flowchart.",
      severity: "medium"
    },
    {
      topic: "Attention & Transformers",
      count: 8,
      exampleQuestions: [
        "Attention mechanism intuition",
        "BERT vs GPT architecture",
        "Fine-tuning BERT for classification"
      ],
      suggestedAction: "Use animated visualization of attention weights. Provide a minimal transformer implementation students can modify.",
      severity: "high"
    }
  ],

  // ---- Confusion Heatmap Data ----
  confusionByLecture: [
    { lecture: 1, title: "Linear Regression", confusionScore: 34, posts: 6, unresolvedPosts: 1 },
    { lecture: 2, title: "Logistic Regression", confusionScore: 28, posts: 5, unresolvedPosts: 1 },
    { lecture: 3, title: "Neural Networks", confusionScore: 78, posts: 7, unresolvedPosts: 2 },
    { lecture: 4, title: "SVMs", confusionScore: 42, posts: 4, unresolvedPosts: 2 },
    { lecture: 5, title: "Clustering", confusionScore: 56, posts: 7, unresolvedPosts: 2 },
    { lecture: 6, title: "Deep Learning / CNNs", confusionScore: 65, posts: 6, unresolvedPosts: 2 },
    { lecture: 7, title: "NLP / Transformers", confusionScore: 71, posts: 5, unresolvedPosts: 2 },
    { lecture: 8, title: "Reinforcement Learning", confusionScore: 31, posts: 3, unresolvedPosts: 2 }
  ],

  // ---- Student Profiles ----
  students: [
    { name: "Alex T.", email: "alex.t@university.edu", postsCount: 9, confusionSignals: 7, assignmentsSubmitted: 0, assignmentsTotal: 3, riskScore: 85, riskLevel: "high", topics: ["backpropagation", "attention", "kernel-trick", "k-means"] },
    { name: "Jordan M.", email: "jordan.m@university.edu", postsCount: 6, confusionSignals: 4, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 52, riskLevel: "medium", topics: ["multiclass", "vanishing-gradient", "hyperparameters"] },
    { name: "Priya R.", email: "priya.r@university.edu", postsCount: 5, confusionSignals: 3, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 48, riskLevel: "medium", topics: ["regularization", "feature-scaling", "reward-shaping"] },
    { name: "Sam K.", email: "sam.k@university.edu", postsCount: 4, confusionSignals: 1, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 15, riskLevel: "low", topics: ["normal-equation", "dbscan"] },
    { name: "Morgan F.", email: "morgan.f@university.edu", postsCount: 4, confusionSignals: 1, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 12, riskLevel: "low", topics: ["decision-boundary", "weight-init"] },
    { name: "Taylor W.", email: "taylor.w@university.edu", postsCount: 4, confusionSignals: 1, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 10, riskLevel: "low", topics: ["vectorization", "embeddings"] },
    { name: "Chris L.", email: "chris.l@university.edu", postsCount: 4, confusionSignals: 2, assignmentsSubmitted: 2, assignmentsTotal: 3, riskScore: 42, riskLevel: "medium", topics: ["learning-rate", "dropout", "fine-tuning"] },
    { name: "Casey N.", email: "casey.n@university.edu", postsCount: 3, confusionSignals: 1, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 8, riskLevel: "low", topics: ["log-loss", "gpu-memory"] },
    { name: "Riley B.", email: "riley.b@university.edu", postsCount: 3, confusionSignals: 1, assignmentsSubmitted: 3, assignmentsTotal: 3, riskScore: 14, riskLevel: "low", topics: ["hidden-layers", "pca"] }
  ],

  // ---- Course Health Metrics ----
  courseHealth: {
    score: 82,
    breakdown: {
      engagement: { score: 88, label: "High", detail: "187 students, 156 active on Piazza" },
      responseTime: { score: 79, label: "Good", detail: "Average response time: 2.3 hours" },
      resolution: { score: 74, label: "Needs Attention", detail: "14 unresolved posts (28%)" },
      participation: { score: 85, label: "High", detail: "83% of students have posted or commented" }
    },
    insights: [
      "Engagement is high — 83% student participation rate",
      "14 unresolved posts need attention, mostly in Lectures 3, 5, and 7",
      "Response time has increased from 1.8h to 2.3h this week",
      "Neural Networks (Lecture 3) has the highest confusion score"
    ],
    trend: [
      { week: "Week 1", score: 90 },
      { week: "Week 2", score: 87 },
      { week: "Week 3", score: 85 },
      { week: "Week 4", score: 82 },
      { week: "Week 5", score: 78 },
      { week: "Week 6", score: 82 }
    ]
  },

  // ---- Email Templates ----
  emailTemplates: {
    struggling: (studentName, topics, professor) => `Subject: Checking in about the course

Hi ${studentName},

I noticed you've had several questions recently about ${topics.join(" and ")}. That's completely normal — these are challenging topics that many students find tricky.

If you'd like, we can schedule a quick 15-minute meeting to go over any concepts you're finding difficult. I'm available during office hours, or we can find another time that works for you.

Don't hesitate to reach out — I'm here to help.

Best,
${professor}`,

    assignment: (studentName, assignmentNum, professor) => `Subject: Assignment ${assignmentNum} — Just checking in

Hi ${studentName},

I noticed that Assignment ${assignmentNum} hasn't been submitted yet. I wanted to check in and see if everything is okay.

If you're having trouble with the assignment or need an extension, please let me know. I'd rather work with you to find a solution than have you fall behind.

Best,
${professor}`
  },

  // ---- Semantic Search (Pre-computed similar questions) ----
  similarQuestions: {
    "gradient descent": [
      { id: 2, title: "How does gradient descent converge?", similarity: 0.94 },
      { id: 5, title: "Learning rate too high", similarity: 0.89 },
      { id: 3, title: "Normal equation vs gradient descent?", similarity: 0.82 },
      { id: 6, title: "Vectorized implementation of gradient descent", similarity: 0.78 }
    ],
    "neural network": [
      { id: 13, title: "How many hidden layers to use?", similarity: 0.91 },
      { id: 14, title: "Vanishing gradient problem", similarity: 0.87 },
      { id: 17, title: "Batch normalization explanation", similarity: 0.83 },
      { id: 18, title: "Dropout regularization", similarity: 0.79 }
    ],
    "backpropagation": [
      { id: 12, title: "Backpropagation chain rule", similarity: 0.96 },
      { id: 14, title: "Vanishing gradient problem", similarity: 0.81 },
      { id: 16, title: "Weight initialization strategies", similarity: 0.74 }
    ],
    "attention": [
      { id: 36, title: "Attention mechanism intuition", similarity: 0.95 },
      { id: 38, title: "BERT vs GPT architecture", similarity: 0.82 },
      { id: 37, title: "Word embeddings vs one-hot encoding", similarity: 0.68 }
    ],
    "clustering": [
      { id: 23, title: "K-means choosing K", similarity: 0.93 },
      { id: 24, title: "K-means vs DBSCAN", similarity: 0.88 },
      { id: 26, title: "K-means initialization problem", similarity: 0.85 },
      { id: 28, title: "Gaussian mixture models", similarity: 0.76 }
    ],
    "overfitting": [
      { id: 10, title: "Regularization in logistic regression", similarity: 0.90 },
      { id: 18, title: "Dropout regularization", similarity: 0.87 },
      { id: 40, title: "Fine-tuning BERT for classification", similarity: 0.72 }
    ]
  }
};

// Make available in different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MOCK_DATA;
}
