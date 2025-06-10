// Run code after html-page is loaded
$(function () {
    let navLinks = document.querySelectorAll('.nav-links a')
    let pageContainer = document.getElementById('page-container')
    let windowTitle = document.getElementById('window-title')
    const pythonButton = document.getElementById('python-button')
    const csharpButton = document.getElementById('csharp-button')

    // Make every assignment-link load the corresponding HTML-body
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.getAttribute('href') == 'index.html') {
                windowTitle.innerText = 'Hem';
                return;
            }
            e.preventDefault();
            goToPage(link, windowTitle, pageContainer);
        })
    })

    pythonButton.addEventListener('click', (e) => goToPage(pythonButton, windowTitle, pageContainer))
    csharpButton.addEventListener('click', (e) => goToPage(csharpButton, windowTitle, pageContainer))

    function goToPage(link, windowTitle, pageContainer) {
        const page = link.getAttribute('page-type');
        const lang = link.getAttribute('lang-name');

        // Update window title based on the link type
        if (page === 'playground') {
            windowTitle.innerText = `${lang.toUpperCase()} Playground`;
        } else {
            windowTitle.innerText = link.textContent.trim();
        }

        // Add script-file to container-content
        let script = document.createElement('script');
        if (page === "playground") {
            script.src = 'playground.js';
        }

        // Handle different types of navigation
        if (page === 'playground' && lang) {
            // Fetch playground content
            fetch(`/${page}/${lang}`)
                .then(response => response.text())
                .then(content => {
                    pageContainer.innerHTML = content;
                    if (script.src) document.body.appendChild(script);
                })
                .catch(err => {
                    console.log('Failed fetching page: ', err);
                    windowTitle.innerText = 'Error';
                });
        } else {
            // Handle regular navigation
            const href = link.getAttribute('href');
            if (href && href !== '#') {
                fetch(href)
                    .then(response => response.text())
                    .then(content => {
                        pageContainer.innerHTML = content;
                    })
                    .catch(err => {
                        console.log('Failed fetching page: ', err);
                        windowTitle.innerText = 'Error';
                    });
            }
        }
    }
});