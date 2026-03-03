// Intersection Observer for scroll-reveal animations
document.addEventListener('DOMContentLoaded', () => {

    // Select all elements that need to be revealed on scroll
    const reveals = document.querySelectorAll('.reveal');
    const staggers = document.querySelectorAll('.reveal-stagger');

    // Observer options
    const observerOptions = {
        root: null, // use viewport
        rootMargin: '0px',
        threshold: 0.15 // trigger when 15% visible
    };

    // Standard reveal observer
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // only animate once
            }
        });
    }, observerOptions);

    // Staggered reveal observer (for grid items like feature cards)
    const staggerObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Add a slight delay based on index for a staggered effect
                setTimeout(() => {
                    entry.target.classList.add('active');
                }, index * 150); // 150ms delay between each item
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Attach observers
    reveals.forEach(element => {
        revealObserver.observe(element);
    });

    staggers.forEach(element => {
        staggerObserver.observe(element);
    });

    // Smooth scroll for internal anchor links (if any are added later)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
