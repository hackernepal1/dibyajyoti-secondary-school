document.addEventListener("DOMContentLoaded", () => {

    // Loading screen hide
    const loader = document.getElementById("loader");

    if (loader) {
        setTimeout(() => {
            loader.classList.add("hidden");

            setTimeout(() => {
                loader.style.display = "none";
            }, 500);

        }, 800);
    }

    // Current year
    const year = document.getElementById("currentYear");

    if (year) {
        year.textContent = new Date().getFullYear();
    }

    // Mobile menu
    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    if (menuToggle && mainNav) {
        menuToggle.addEventListener("click", () => {
            mainNav.classList.toggle("open");
        });
    }

    // Back to top
    const backToTop = document.getElementById("backToTop");

    if (backToTop) {
        window.addEventListener("scroll", () => {
            if (window.scrollY > 400) {
                backToTop.classList.add("show");
            } else {
                backToTop.classList.remove("show");
            }
        });

        backToTop.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

});
