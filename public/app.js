document.addEventListener('DOMContentLoaded', () => {
  const quizSection = document.getElementById('quiz');
  const quizForm = document.getElementById('quizForm');
  const steps = Array.from(document.querySelectorAll('.quiz-step'));
  const progressBar = document.getElementById('quizProgress');
  const prevButton = document.getElementById('prevQuestion');
  const nextButton = document.getElementById('nextQuestion');
  const submitButton = document.getElementById('submitQuiz');
  const thankYouSection = document.getElementById('thankYou');
  const offerCta = document.getElementById('offerCta');
  const heroSection = document.getElementById('hero');
  const leadCard = document.getElementById('leadCard');
  const postQuizForm = document.getElementById('postQuizForm');
  const afterQuizForm = document.getElementById('afterQuizForm');
  const startQuizButton = document.getElementById('startQuizButton');

  let leadId = null;
  let currentStep = 0;

  // Load upsell URL or fallback
  fetch('/api/lead')
    .then((res) => res.json())
    .then((config) => {
      if (config?.upsellUrl) offerCta.href = config.upsellUrl;
    })
    .catch(() => {
      offerCta.href = 'https://payhip.com/b/Lnsjh/af68defc385c8e9';
    });

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();

  // Helper: set active quiz step
  function setStep(index) {
    steps.forEach((step, idx) => {
      step.classList.toggle('active', idx === index);
    });
    currentStep = index;
    const progress = ((index + 1) / steps.length) * 100;
    progressBar.style.width = `${progress}%`;
    prevButton.style.visibility = index === 0 ? 'hidden' : 'visible';
    nextButton.style.display = index === steps.length - 1 ? 'none' : 'inline-flex';
    submitButton.style.display = index === steps.length - 1 ? 'inline-flex' : 'none';
  }

  // Validate current step
  function stepIsValid(stepElement) {
    const requiredInputs = Array.from(stepElement.querySelectorAll('input[required]'));
    if (!requiredInputs.length) return true;
    return requiredInputs.some((input) => {
      if (input.type === 'radio') {
        const group = stepElement.querySelectorAll(`input[name="${input.name}"]`);
        return Array.from(group).some((item) => item.checked);
      }
      return input.value.trim() !== '';
    });
  }

  // Gather quiz answers
  function gatherResponses() {
    const responses = [];
    steps.forEach((step) => {
      const question = step.dataset.question;
      const selectedRadio = step.querySelector('input[type="radio"]:checked');
      const textarea = step.querySelector('textarea');
      if (selectedRadio) {
        responses.push({ question, answer: selectedRadio.value });
      } else if (textarea && textarea.value.trim()) {
        responses.push({ question, answer: textarea.value.trim() });
      } else if (question) {
        responses.push({ question, answer: 'No response provided' });
      }
    });
    return responses;
  }

  // Transition functions
  function showQuiz() {
    leadCard.style.display = 'none';
    quizSection.classList.add('active');
    heroSection.classList.add('submitted');
    postQuizForm.classList.remove('active');
    thankYouSection.classList.remove('active');
    setStep(0);
    window.scrollTo({ top: quizSection.offsetTop - 40, behavior: 'smooth' });
  }

  function showPostQuizForm() {
    quizSection.classList.remove('active');
    postQuizForm.classList.add('active');
    thankYouSection.classList.remove('active');
    window.scrollTo({ top: postQuizForm.offsetTop - 40, behavior: 'smooth' });
  }

  function showThankYou() {
    postQuizForm.classList.remove('active');
    thankYouSection.classList.add('active');
    window.scrollTo({ top: thankYouSection.offsetTop - 40, behavior: 'smooth' });
  }

  // Button listeners
  startQuizButton.addEventListener('click', showQuiz);

  prevButton.addEventListener('click', () => {
    if (currentStep > 0) setStep(currentStep - 1);
  });

  nextButton.addEventListener('click', () => {
    const stepElement = steps[currentStep];
    if (!stepIsValid(stepElement)) {
      stepElement.classList.add('shake');
      setTimeout(() => stepElement.classList.remove('shake'), 400);
      return;
    }
    if (currentStep < steps.length - 1) setStep(currentStep + 1);
  });

  // Submit quiz → show post-quiz form
  quizForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const finalStep = steps[currentStep];
    if (!stepIsValid(finalStep)) {
      finalStep.classList.add('shake');
      setTimeout(() => finalStep.classList.remove('shake'), 400);
      return;
    }
    showPostQuizForm();
  });

  // Submit post-quiz form → show thank you
  afterQuizForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(afterQuizForm);
    const payload = Object.fromEntries(formData.entries());
    const responses = gatherResponses();

    try {
      // Save lead
      const leadResponse = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!leadResponse.ok) throw new Error('Failed to save lead');
      const leadData = await leadResponse.json();
      leadId = leadData.leadId;

      // Save quiz responses
      await fetch('/api/quizResponses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, responses }),
      });

      showThankYou();
    } catch (err) {
      alert('Error saving your info. Please try again.');
    }
  });

  setStep(0);
});
