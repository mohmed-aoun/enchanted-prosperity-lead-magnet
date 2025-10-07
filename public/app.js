document.addEventListener('DOMContentLoaded', () => {
  const leadForm = document.getElementById('leadForm');
  const leadCard = document.getElementById('leadCard');
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

  let leadId = null;
  let currentStep = 0;

  fetch('/api/config')
    .then((res) => res.json())
    .then((config) => {
      if (config?.upsellUrl) {
        offerCta.href = config.upsellUrl;
      }
    })
    .catch(() => {
      offerCta.href = 'https://enchantedprosperity.com/ultimate-credit-guide';
    });

  document.getElementById('year').textContent = new Date().getFullYear();

  const params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) => {
    const field = leadForm.querySelector(`[name="${key}"]`);
    if (field) {
      field.value = params.get(key) || '';
    }
  });

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

  function stepIsValid(stepElement) {
    const requiredInputs = Array.from(stepElement.querySelectorAll('input[required]'));
    if (!requiredInputs.length) {
      return true;
    }
    return requiredInputs.some((input) => {
      if (input.type === 'radio') {
        const group = stepElement.querySelectorAll(`input[name="${input.name}"]`);
        return Array.from(group).some((item) => item.checked);
      }
      return input.value.trim() !== '';
    });
  }

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

  function showQuiz() {
    quizSection.classList.add('active');
    heroSection.classList.add('submitted');
    setStep(0);
    window.scrollTo({ top: quizSection.offsetTop - 40, behavior: 'smooth' });
  }

  function showThankYou() {
    quizSection.classList.remove('active');
    thankYouSection.classList.add('active');
    window.scrollTo({ top: thankYouSection.offsetTop - 40, behavior: 'smooth' });
  }

  leadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = leadForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';

    const formData = new FormData(leadForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Unable to save lead');
      }

      const data = await response.json();
      leadId = data.leadId;
      leadCard.classList.add('success');
      leadCard.innerHTML = `
        <div class="lead-confirmation">
          <h2>Great! Let’s Pinpoint Your Credit Breakthrough.</h2>
          <p class="muted">Answer the next questions so we can craft your personalized roadmap.</p>
          <button class="primary-button" id="startQuizButton">Take the Quiz →</button>
        </div>
      `;
      const startQuizButton = document.getElementById('startQuizButton');
      startQuizButton.addEventListener('click', () => {
        showQuiz();
      });
      showQuiz();
    } catch (error) {
      alert('We could not capture your details. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText || 'Start My Credit Quiz';
    }
  });

  prevButton.addEventListener('click', () => {
    if (currentStep > 0) {
      setStep(currentStep - 1);
    }
  });

  nextButton.addEventListener('click', () => {
    const stepElement = steps[currentStep];
    if (!stepIsValid(stepElement)) {
      stepElement.classList.add('shake');
      setTimeout(() => stepElement.classList.remove('shake'), 400);
      return;
    }
    if (currentStep < steps.length - 1) {
      setStep(currentStep + 1);
    }
  });

  quizForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!leadId) {
      alert('Please complete the first step before submitting the quiz.');
      return;
    }

    const finalStep = steps[currentStep];
    if (!stepIsValid(finalStep)) {
      finalStep.classList.add('shake');
      setTimeout(() => finalStep.classList.remove('shake'), 400);
      return;
    }

    const responses = gatherResponses();
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';

    try {
      const response = await fetch('/api/quizResponses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, responses }),
      });

      if (!response.ok) {
        throw new Error('Unable to save responses');
      }

      showThankYou();
    } catch (error) {
      alert('Something went wrong. Please try submitting again.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit My Results →';
    }
  });

  setStep(0);
});
