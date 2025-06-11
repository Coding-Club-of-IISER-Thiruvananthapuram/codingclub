const fs = require('fs');
const path = require('path');

// List of blog post files
const blogPostsDir = path.join(__dirname, 'Blogs', 'Posts');
const files = fs.readdirSync(blogPostsDir).filter(file => file.endsWith('.html'));

console.log(`Found ${files.length} blog post files to update`);

files.forEach(file => {
    const filePath = path.join(blogPostsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    // Replace GitHub Pages URLs with relative paths
    content = content.replace(/https:\/\/snt-iiser-tvm\.github\.io\/codingclub\//g, '../../');
    content = content.replace(/https:\/\/snt-iiser-tvm\.github\.io\/codingclub\/Blogs\//g, '../');
    content = content.replace(/https:\/\/snt-iiser-tvm\.github\.io\/codingclub\/Blogs\/Posts\//g, '');
    
    // Fix specific paths
    content = content.replace(/href="..\/..\/Blogs\/Blog main.html"/g, 'href="../Blog main.html"');
    content = content.replace(/href="..\/..\/Blogs\/Posts\//g, 'href="');
    content = content.replace(/href="..\/..\/"/g, 'href="../../index.html"');
    content = content.replace(/href="..\/..\/\/?"/g, 'href="../../index.html"');
    
    // Fix CSS path
    content = content.replace(/<link rel="stylesheet" href="..\/..\/Blogs\/blogstyle.css">/g, '<link rel="stylesheet" href="../blogstyle.css">');
    
    // Fix image paths
    content = content.replace(/src="..\/..\/Blogs\/Media\//g, 'src="../Media/');
    
    // Fix script paths
    content = content.replace(/src="..\/..\/Blogs\/prism.js"/g, 'src="../prism.js"');
    
    // Fix the CSS link for prism.css
    content = content.replace(/<link rel="stylesheet" href="..\/..\/Blogs\/prism.css">/g, '<link rel="stylesheet" href="../prism.css">');
    
    // Fix the home button link - this is the critical fix
    content = content.replace(/<a href="..\/..\/index.html">/g, '<a href="../../index.html">');
    content = content.replace(/<a href="..\/..\/?">/g, '<a href="../../index.html">');
    content = content.replace(/<a href="..\/..\/\/">/g, '<a href="../../index.html">');
    
    // Fix the footer home link
    content = content.replace(/<a href="..\/..\/index.html" class="logo-link">/g, '<a href="../../index.html" class="logo-link">');
    content = content.replace(/<a href="..\/..\/?" class="logo-link">/g, '<a href="../../index.html" class="logo-link">');
    content = content.replace(/<a href="..\/..\/\/" class="logo-link">/g, '<a href="../../index.html" class="logo-link">');
    
    // Direct fix for the home icon in navbar
    content = content.replace(/<a href="..\/..\/?">/g, '<a href="../../index.html">');
    content = content.replace(/<a href="..\/..\/\/">/g, '<a href="../../index.html">');
    content = content.replace(/<a href="..\/..\/?">/g, '<a href="../../index.html">');
    content = content.replace(/<a href="..\/..\/index.html">/g, '<a href="../../index.html">');
    content = content.replace(/<a href="..\/..\/?">/g, '<a href="../../index.html">');
    
    // Write the updated content back to the file
    fs.writeFileSync(filePath, content);
    
    if (content !== originalContent) {
        console.log(`Updated ${file}`);
    } else {
        console.log(`No changes needed for ${file}`);
    }
});

console.log('All blog post files have been updated!'); 