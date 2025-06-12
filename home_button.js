const fs = require('fs');
const path = require('path');

const blogPostsDir = path.join(__dirname, 'Blogs', 'Posts');
const files = fs.readdirSync(blogPostsDir).filter(file => file.endsWith('.html'));

console.log(`Found ${files.length} blog post files to check`);
let fixedCount = 0;

files.forEach(file => {
    const filePath = path.join(blogPostsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let fileModified = false;
    
    console.log(`\nProcessing ${file}...`);
    
    if (content.includes('<a href="../../">')) {
        content = content.replace(/<a href="..\/..\/\">/g, '<a href="../../index.html">');
        console.log('- Fixed navbar home button (../../)');
        fileModified = true;
    }
    
    if (content.includes('<a href="../..//?">')) {
        content = content.replace(/<a href="..\/..\/\/\?">/g, '<a href="../../index.html">');
        console.log('- Fixed navbar home button (../..//?)');
        fileModified = true;
    }
    
    if (content.includes('<a href="../../" class="logo-link">')) {
        content = content.replace(/<a href="..\/..\/\" class="logo-link">/g, '<a href="../../index.html" class="logo-link">');
        console.log('- Fixed footer home link (../../)');
        fileModified = true;
    }
    
    if (content.includes('<a href="../..//?" class="logo-link">')) {
        content = content.replace(/<a href="..\/..\/\/\?" class="logo-link">/g, '<a href="../../index.html" class="logo-link">');
        console.log('- Fixed footer home link (../..//?)');
        fileModified = true;
    }
    
    const replacements = [
        { from: 'href="../../"', to: 'href="../../index.html"' },
        { from: 'href="../..//?"', to: 'href="../../index.html"' },
        { from: 'href="../..//"', to: 'href="../../index.html"' }
    ];
    
    replacements.forEach(({ from, to }) => {
        if (content.includes(from)) {
            const beforeCount = content.split(from).length - 1;
            content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
            const afterCount = content.split(to).length - 1;
            const fixedCount = afterCount - (content.split(to).length - 1 - beforeCount);
            if (fixedCount > 0) {
                console.log(`- Fixed ${fixedCount} instances of ${from}`);
                fileModified = true;
            }
        }
    });
    
    if (fileModified) {
        fs.writeFileSync(filePath, content);
        fixedCount++;
        console.log(`✅ Fixed home button links in ${file}`);
    } else {
        console.log(`✓ No issues found in ${file}`);
    }
});

console.log(`\nSummary: Fixed home button links in ${fixedCount} files out of ${files.length} total files.`);

// Add the return to home button
window.addEventListener('DOMContentLoaded', function () {
    // Create the fixed button element
    const homeButton = document.createElement('a');
    homeButton.id = 'home-button';
    homeButton.href = 'index.html';
    homeButton.classList.add('home-button');
    homeButton.innerHTML = '<i class="fas fa-home"></i>';
    homeButton.setAttribute('aria-label', 'Return to home page');
    
    // Add styles to the button
    homeButton.style.position = 'fixed';
    homeButton.style.bottom = '20px';
    homeButton.style.right = '20px';
    homeButton.style.zIndex = '999';
    homeButton.style.width = '50px';
    homeButton.style.height = '50px';
    homeButton.style.borderRadius = '50%';
    homeButton.style.backgroundColor = '#0575e6';
    homeButton.style.color = 'white';
    homeButton.style.display = 'flex';
    homeButton.style.justifyContent = 'center';
    homeButton.style.alignItems = 'center';
    homeButton.style.boxShadow = '0 0 10px rgba(0, 242, 96, 0.5), 0 0 20px rgba(5, 117, 230, 0.3)';
    homeButton.style.transition = 'all 0.3s ease';
    homeButton.style.textDecoration = 'none';
    
    // Add hover effect
    homeButton.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.1)';
        this.style.backgroundColor = '#00f260';
    });
    
    homeButton.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
        this.style.backgroundColor = '#0575e6';
    });
    
    // Append the button to the body
    document.body.appendChild(homeButton);

    // Mobile Menu Functionality
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuButton && mobileMenu) {
        // Toggle mobile menu
        mobileMenuButton.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
            
            // Toggle burger icon animation
            const burgerIcon = this.querySelector('.burger-icon');
            if (burgerIcon) {
                burgerIcon.classList.toggle('active');
            }
        });
        
        // Close mobile menu when a link is clicked
        const mobileMenuLinks = mobileMenu.querySelectorAll('a');
        mobileMenuLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenu.classList.add('hidden');
                const burgerIcon = document.querySelector('.burger-icon');
                if (burgerIcon) {
                    burgerIcon.classList.remove('active');
                }
            });
        });
        
        // Close mobile menu when clicking outside
        document.addEventListener('click', function(event) {
            if (mobileMenuButton && mobileMenu && 
                !mobileMenu.contains(event.target) && 
                !mobileMenuButton.contains(event.target) && 
                !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
                const burgerIcon = document.querySelector('.burger-icon');
                if (burgerIcon) {
                    burgerIcon.classList.remove('active');
                }
            }
        });
    }
});
