class PersonSearchSystem {
    constructor() {
        this.personDatabase = this.buildPersonDatabase();
        this.initializeSearch();
    }

    buildPersonDatabase() {        return {
            "saurab mishra": {
                name: "Saurab Mishra",
                role: "Team Member",
                email: "saurab23@iisertvm.ac.in",
                skills: ["LLMs", "AI Research", "Data Science"],
                bio: "Data Science and AI enthusiast with expertise in LLMs, AI, and MAS.",
                image: "saurabprofile.jpg",
                locations: [
                    {
                        page: "Team Page",
                        path: "team.html",
                        section: "Current Team Members",
                        description: "Full profile with bio, skills, and contact information"
                    },
                    {
                        page: "Projects Page",
                        path: "projects.html",
                        section: "Project Contributors",
                        description: "Listed as developer/contributor on various projects"
                    },
                    {
                        page: "Blog Author",
                        path: "Blogs/Posts/Saurab's blog.html",
                        section: "Blog Posts",
                        description: "Author of technical blog posts"
                    }
                ]
            },
            "aryan bhatia": {
                name: "Aryan Bhatia",
                role: "Team Member",
                email: "aryanbhatia21@iisertvm.ac.in",
                skills: ["Physics", "Mathematics", "Coding"],
                bio: "Just imagine the total number of atoms in the universe are smaller than what lies between 0 and 1. I am here to look for what's beyond.",
                image: "Aryan.jpg",
                linkedin: "https://www.linkedin.com/in/aryan-bhatia-5a4942134/",
                github: "https://github.com/idontknow700",
                locations: [
                    {
                        page: "Team Page",
                        path: "team.html",
                        section: "Current Team Members",
                        description: "Full profile with bio, skills, and contact information"
                    }
                ]
            },
            "abhinav girish": {
                name: "Abhinav Girish",
                role: "Team Member",
                email: "abhinavggp@gmail.com",
                skills: ["Applied Mathematics", "Simulations", "LLMs"],
                bio: "Just a guy who likes computers",
                image: "abhinav.png",
                locations: [
                    {
                        page: "Team Page",
                        path: "team.html",
                        section: "Current Team Members", 
                        description: "Full profile with bio, skills, and contact information"
                    }
                ]
            },
            "ronak": {
                name: "Ronak",
                role: "Team Member",
                email: "ronak23@iisertvm.ac.in",
                skills: ["Physics", "Coding", "Design"],
                bio: "I'm excited to learn, create, and grow in the world of coding. I love solving problems and turning ideas into reality. Let's build something amazing together!",
                image: "Ronakprofilepic.jpg",
                linkedin: "https://www.linkedin.com/in/ronak-singh-raina-91241232b/",
                locations: [
                    {
                        page: "Team Page",
                        path: "team.html",
                        section: "Current Team Members",
                        description: "Full profile with bio, skills, and contact information"
                    }
                ]
            },
            "nishanth sreenath": {
                name: "Nishanth Sreenath",
                role: "Team Member",
                email: "nishanth23@iisertvm.ac.in",
                skills: ["Physics", "Mathematics", "Programming"],
                bio: "With some coding and math, we can make little universes and play around with it like a sandbox",
                image: "nishanthpic.jpg",
                locations: [
                    {
                        page: "Team Page",
                        path: "team.html",
                        section: "Current Team Members",
                        description: "Full profile with bio, skills, and contact information"
                    }
                ]            },
            "ashutosh kumar": {
                name: "Ashutosh Kumar",
                role: "Alumni",
                batch: "Batch 2019",
                position: "Ph.D. at University of Jyvaskala",
                intro: "Exploring the realm of Quantum Information and computation",
                email: "ashutoshkr19@iisertvm.ac.in",
                linkedin: "https://www.linkedin.com/in/ashutosh-kumar-a7134b202/",
                image: "alumni_ashutosh.jpg",
                locations: [
                    {
                        page: "Alumni Page",
                        path: "alumni.html",
                        section: "Former Members",
                        description: "Alumni profile with current position and research area"
                    }
                ]
            },
            "krishna kumar singh": {
                name: "Krishna Kumar Singh",
                role: "Alumni",
                batch: "Batch 2019",
                position: "Ph.D. at University of Leeds",
                intro: "An Astrophysicist Passionate to Study Extreme Universe in Computer Simulation Lab",
                email: "Krishna19@alumni.iisertvm.ac.in",
                linkedin: "https://www.linkedin.com/in/kks0/",
                image: "alumni_krishna.jpg",
                locations: [
                    {
                        page: "Alumni Page",
                        path: "alumni.html",
                        section: "Former Members",
                        description: "Alumni profile with current position and research area"
                    }
                ]            },
            "manini": {
                name: "Manini",
                role: "Blog Author",
                locations: [
                    {
                        page: "Blog Post",
                        path: "Blogs/Posts/Manini's blog.html",
                        section: "Blog Authors",
                        description: "Author of technical blog post"
                    }
                ]
            },
            "joshy": {
                name: "Joshy",
                role: "Blog Author",
                locations: [
                    {
                        page: "Blog Post",
                        path: "Blogs/Posts/Joshy's blog.html",
                        section: "Blog Authors",
                        description: "Author of technical blog post"
                    }
                ]
            },
            "mishra": {
                name: "Mishra",
                role: "Blog Author",
                locations: [
                    {
                        page: "Blog Post 1",
                        path: "Blogs/Posts/Mishra's blog.html",
                        section: "Blog Authors",
                        description: "Author of technical blog post"
                    },
                    {
                        page: "Blog Post 2",
                        path: "Blogs/Posts/Mishra's blog 2.html",
                        section: "Blog Authors",
                        description: "Author of second technical blog post"
                    }
                ]
            },
            "ananya": {
                name: "Ananya",
                role: "Blog Author",
                locations: [
                    {
                        page: "Blog Post",
                        path: "Blogs/Posts/Ananya's blog.html",
                        section: "Blog Authors",
                        description: "Author of technical blog post"
                    }
                ]
            }
        };
    }

    initializeSearch() {
        this.enhanceExistingSearch();
    }

    enhanceExistingSearch() {
        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('searchInput');
            const searchResults = document.getElementById('searchResults');
            
            if (searchInput && searchResults) {
                searchInput.removeEventListener('input', this.originalSearchHandler);
                searchInput.addEventListener('input', (e) => this.handleSearch(e, searchResults));
            }
        });
    }

    handleSearch(event, resultsContainer) {
        const query = event.target.value.toLowerCase().trim();
        
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        const results = this.searchPersons(query);
        const generalResults = this.searchGeneral(query);
        
        const allResults = [...results, ...generalResults];
        
        if (allResults.length > 0) {
            resultsContainer.innerHTML = this.renderSearchResults(allResults, query);
        } else {
            resultsContainer.innerHTML = `
                <div class="p-4 text-center">
                    <div class="text-gray-400 mb-2">
                        <i class="fas fa-search text-2xl"></i>
                    </div>
                    <div class="text-gray-400">No results found for "${query}"</div>
                    <div class="text-sm text-gray-500 mt-2">Try searching for team member names, alumni, or general content</div>
                </div>
            `;
        }
    }

    searchPersons(query) {
        const results = [];
        
        Object.entries(this.personDatabase).forEach(([key, person]) => {
            const searchableText = `${person.name} ${person.role} ${person.email || ''} ${person.skills?.join(' ') || ''} ${person.bio || ''}`.toLowerCase();
            
            if (searchableText.includes(query) || person.name.toLowerCase().includes(query)) {
                results.push({
                    type: 'person',
                    person: person,
                    relevanceScore: this.calculatePersonRelevance(query, person)
                });
            }
        });
        
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    searchGeneral(query) {
        const generalContent = [
            { title: 'Home', url: 'index.html', keywords: 'home main landing coding club' },
            { title: 'Projects & Courses', url: 'projects.html', keywords: 'projects courses innovations solutions step mentor web development' },
            { title: 'Team Members', url: 'team.html', keywords: 'team members developers coders innovators' },
            { title: 'Tech Stack', url: '#tech-stack', keywords: 'technologies programming languages frameworks tools' },
            { title: 'FAQ', url: '#faq', keywords: 'frequently asked questions help information' },
            { title: 'Alumni', url: 'alumni.html', keywords: 'alumni former members graduates' },
            { title: 'Blogs', url: 'Blogs/Blog main.html', keywords: 'blogs articles posts writing content' },
            { title: 'Resources', url: 'store.html', keywords: 'resources materials learning education downloads' }
        ];

        return generalContent
            .filter(item => 
                item.title.toLowerCase().includes(query) || 
                item.keywords.toLowerCase().includes(query)
            )
            .map(item => ({
                type: 'general',
                item: item
            }));
    }

    calculatePersonRelevance(query, person) {
        let score = 0;
        const queryLower = query.toLowerCase();
        const nameLower = person.name.toLowerCase();
        
        if (nameLower === queryLower) score += 100;
        else if (nameLower.startsWith(queryLower)) score += 80;
        else if (nameLower.includes(queryLower)) score += 60;
        
        if (person.role && person.role.toLowerCase().includes(queryLower)) score += 20;
        
        if (person.skills && person.skills.some(skill => skill.toLowerCase().includes(queryLower))) score += 15;
        
        score += person.locations.length * 5;
        
        return score;
    }

    renderSearchResults(results, query) {
        let html = '';
        
        const personResults = results.filter(r => r.type === 'person');
        const generalResults = results.filter(r => r.type === 'general');
        
        if (personResults.length > 0) {
            html += '<div class="mb-4"><h3 class="text-lg font-semibold text-blue-400 mb-2"><i class="fas fa-users mr-2"></i>People Found</h3>';
            personResults.forEach(result => {
                html += this.renderPersonResult(result.person, query);
            });
            html += '</div>';
        }
        
        if (generalResults.length > 0) {
            html += '<div class="mb-4"><h3 class="text-lg font-semibold text-green-400 mb-2"><i class="fas fa-globe mr-2"></i>Pages & Content</h3>';
            generalResults.forEach(result => {
                html += this.renderGeneralResult(result.item);
            });
            html += '</div>';
        }
        
        return html;
    }

    renderPersonResult(person, query) {
        const locations = person.locations.map(location => 
            `<a href="${location.path}" class="block p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors mb-1">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-medium text-blue-300">${location.page}</div>
                        <div class="text-xs text-gray-400">${location.section}</div>
                    </div>
                    <div class="text-xs text-gray-500">${location.path}</div>
                </div>
                <div class="text-xs text-gray-500 mt-1">${location.description}</div>
            </a>`
        ).join('');

        return `
            <div class="bg-gray-900 p-4 rounded-lg mb-3">
                <div class="flex items-start space-x-3">
                    ${person.image ? `
                        <img src="${person.image}" alt="${person.name}" class="w-12 h-12 rounded-full object-cover">
                    ` : `
                        <div class="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                            <i class="fas fa-user text-gray-400"></i>
                        </div>
                    `}
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                            <h4 class="font-semibold text-white">${this.highlightQuery(person.name, query)}</h4>
                            <span class="px-2 py-1 text-xs bg-blue-900/50 text-blue-300 rounded">${person.role}</span>
                        </div>
                        
                        ${person.bio ? `<p class="text-sm text-gray-400 mb-2">${person.bio}</p>` : ''}
                        
                        ${person.skills ? `
                            <div class="flex flex-wrap gap-1 mb-2">
                                ${person.skills.map(skill => 
                                    `<span class="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded">${skill}</span>`
                                ).join('')}
                            </div>
                        ` : ''}
                        
                        ${person.email ? `
                            <div class="text-xs text-gray-500 mb-2">
                                <i class="fas fa-envelope mr-1"></i>
                                <a href="mailto:${person.email}" class="hover:text-blue-400">${person.email}</a>
                            </div>
                        ` : ''}
                        
                        <div class="space-y-1">
                            <div class="text-sm font-medium text-gray-300">Found in ${person.locations.length} location${person.locations.length > 1 ? 's' : ''}:</div>
                            ${locations}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderGeneralResult(item) {
        return `
            <a href="${item.url}" class="block p-3 hover:bg-gray-800 rounded transition-colors mb-2">
                <div class="font-medium text-green-400">${item.title}</div>
                <div class="text-sm text-gray-400">${item.keywords.split(' ').slice(0, 6).join(', ')}</div>
                <div class="text-xs text-gray-500 mt-1">${item.url}</div>
            </a>
        `;
    }

    highlightQuery(text, query) {
        if (!query || query.length < 2) return text;
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark class="bg-yellow-400 text-black px-1 rounded">$1</mark>');
    }
}

const personSearch = new PersonSearchSystem();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PersonSearchSystem;
}
