/**
 * Shared Navigation Component - Bootstrap Version
 * This file provides a consistent navigation bar for all pages using Bootstrap
 */

function createSharedNavigation() {
    // Detect if we're in a subdirectory and adjust paths accordingly
    const currentPath = window.location.pathname;
    const isInSubdirectory = currentPath.includes('/Blogs/') || currentPath.includes('/members/');
    const pathPrefix = isInSubdirectory ? '../' : '';
    
    return `
        <nav class="navbar navbar-inverse navbar-fixed-top cyber-nav">
            <div class="container-fluid">
                <div class="navbar-header">
                    <button type="button" class="navbar-toggle collapsed" data-toggle="collapse" data-target="#main-navbar" aria-expanded="false">
                        <span class="sr-only">Toggle navigation</span>
                        <span class="icon-bar"></span>
                        <span class="icon-bar"></span>
                        <span class="icon-bar"></span>
                    </button>
                    <a class="navbar-brand" href="${pathPrefix}index.html">
                        <img src="${pathPrefix}connection_network_infinity_partial_logo.png" alt="Coding Club Logo" style="height: 30px; display: inline-block; margin-right: 8px;">
                        Coding Club
                    </a>
                </div>

                <div class="collapse navbar-collapse" id="main-navbar">
                    <ul class="nav navbar-nav">
                        <li class="dropdown">
                            <a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false">
                                <i class="fas fa-users"></i> Alumni & FAQ <span class="caret"></span>
                            </a>
                            <ul class="dropdown-menu">
                                <li><a href="${pathPrefix}alumni.html"><i class="fas fa-user-graduate"></i> Alumni</a></li>
                                <li><a href="${pathPrefix}index.html#faq"><i class="fas fa-question-circle"></i> FAQ</a></li>
                            </ul>
                        </li>
                        <li class="dropdown">
                            <a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false">
                                <i class="fas fa-rocket"></i> Resources & Projects <span class="caret"></span>
                            </a>
                            <ul class="dropdown-menu">
                                <li><a href="${pathPrefix}projects.html"><i class="fas fa-project-diagram"></i> Projects & Courses</a></li>
                                <li><a href="${isInSubdirectory && currentPath.includes('/Blogs/') ? 'Blog main.html' : pathPrefix + 'Blogs/Blog main.html'}"><i class="fas fa-blog"></i> Blogs</a></li>
                                <li><a href="${pathPrefix}store.html"><i class="fas fa-store"></i> Resources</a></li>
                            </ul>
                        </li>
                        <li><a href="${pathPrefix}team.html"><i class="fas fa-users-cog"></i> Team</a></li>
                    </ul>
                    
                    <ul class="nav navbar-nav navbar-right">
                        <li>
                            <a href="https://docs.google.com/forms/d/e/1FAIpQLSeJuIlW4REb117B8I4Kd_AkGgveW4ohVDxWk-Ux5w5dumAYFQ/viewform?usp=sharing" 
                               class="navbar-cta">
                                <i class="fas fa-paper-plane"></i> Join Us
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    `;
}

function initializeNavigation() {
    // Bootstrap handles all dropdown functionality automatically
    // Just add any custom scroll effects if needed
    
    let lastScrollTop = 0;
    const navbar = document.querySelector('.cyber-nav');
    
    if (navbar) {
        window.addEventListener('scroll', function() {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Add scrolled class for styling
            if (scrollTop > 10) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
            
            lastScrollTop = scrollTop;
        });
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Insert navigation if placeholder exists
    const navPlaceholder = document.getElementById('navigation-placeholder') || document.getElementById('navbar-placeholder');
    if (navPlaceholder) {
        navPlaceholder.innerHTML = createSharedNavigation();
        
        // Initialize after a short delay to ensure Bootstrap is loaded
        setTimeout(() => {
            initializeNavigation();
        }, 100);
    }
    
    // Initialize if navigation already exists
    if (document.querySelector('.cyber-nav')) {
        initializeNavigation();
    }
});

// For manual initialization
window.SharedNavigation = {
    create: createSharedNavigation,
    initialize: initializeNavigation
};
