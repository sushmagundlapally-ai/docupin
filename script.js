class DocumentBookmarkManager {
    constructor() {
        this.bookmarks = this.loadBookmarks();
        this.currentFilter = 'all';
        this.searchIndex = new Map();
        this.itemsPerPage = 15;
        this.currentPage = 1;
        this.isCompactView = false;
        this.isGroupedView = false;
        this.initializeEventListeners();
        this.renderStats();
        this.renderBookmarks();
        this.buildSearchIndex();
    }

    initializeEventListeners() {
        // Add bookmark functionality
        document.getElementById('addButton').addEventListener('click', () => this.addBookmark());
        document.getElementById('linkInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addBookmark();
        });
        document.getElementById('titleInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addBookmark();
        });
        document.getElementById('tagsInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addBookmark();
        });
        document.getElementById('titleInput').addEventListener('input', () => {
            const linkInput = document.getElementById('linkInput');
            if (linkInput.value.trim()) {
                this.previewLink(linkInput.value.trim());
            }
        });
        document.getElementById('linkInput').addEventListener('input', (e) => this.previewLink(e.target.value));

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => this.searchBookmarks(e.target.value));
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchBookmarks();
        });

        // Filter functionality
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });

        // View controls
        document.getElementById('compactToggle').addEventListener('click', () => this.toggleCompactView());
        document.getElementById('groupToggle').addEventListener('click', () => this.toggleGroupView());
        
        // Load more functionality
        const loadMoreBtn = document.getElementById('loadMore');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMore());
        }
    }

    async addBookmark() {
        const linkInput = document.getElementById('linkInput');
        const titleInput = document.getElementById('titleInput');
        const tagsInput = document.getElementById('tagsInput');
        const url = linkInput.value.trim();
        const customTitle = titleInput.value.trim();
        const customTags = this.parseTagsInput(tagsInput.value.trim());

        if (!url) {
            this.showToast('Please enter a valid URL', 'error');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showToast('Please enter a valid URL', 'error');
            return;
        }

        // Check if bookmark already exists
        if (this.bookmarks.some(bookmark => bookmark.url === url)) {
            this.showToast('This document is already bookmarked', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const metadata = await this.extractMetadata(url);
            
            // Use custom title if provided, otherwise use extracted title
            const finalTitle = customTitle || metadata.title;
            
            // Generate smart description (don't mention custom title in description)
            const finalDescription = customTitle 
                ? this.generateSmartDescription(customTitle, metadata.platform, url)
                : metadata.description;
            
            // Combine auto-generated tags with custom tags
            const autoTags = customTitle ? [...metadata.tags, ...this.generateTagsFromTitle(customTitle)] : metadata.tags || [];
            const allTags = [...new Set([...customTags, ...autoTags])]; // Remove duplicates
            
            const bookmark = {
                id: Date.now().toString(),
                url: url,
                title: finalTitle,
                description: finalDescription,
                platform: metadata.platform,
                favicon: metadata.favicon,
                addedDate: new Date().toISOString(),
                tags: allTags,
                customTags: customTags, // Store custom tags separately for display
                content: customTitle ? `${metadata.content} ${customTitle.toLowerCase()} ${customTags.join(' ')}` : `${metadata.content || ''} ${customTags.join(' ')}`,
                hasCustomTitle: !!customTitle
            };

            this.bookmarks.unshift(bookmark);
            this.saveBookmarks();
            this.buildSearchIndex();
            this.currentPage = 1; // Reset pagination
            this.renderStats();
            this.renderBookmarks();
            
            linkInput.value = '';
            titleInput.value = '';
            tagsInput.value = '';
            this.hidePreview();
            
            const tagInfo = customTags.length > 0 ? ` (${customTags.length} tag${customTags.length > 1 ? 's' : ''} added)` : '';
            this.showToast(`Bookmark added successfully!${customTitle ? ' (Custom title used)' : ''}${tagInfo}`, 'success');
        } catch (error) {
            console.error('Error adding bookmark:', error);
            this.showToast('Failed to add bookmark. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    parseTagsInput(input) {
        if (!input) return [];
        
        // Split by comma, trim whitespace, convert to lowercase, remove empty strings
        return input
            .split(',')
            .map(tag => tag.trim().toLowerCase())
            .filter(tag => tag.length > 0)
            .slice(0, 10); // Limit to 10 tags
    }

    async extractMetadata(url) {
        // Determine platform based on URL
        const platform = this.detectPlatform(url);
        
        // Generate title with improved logic
        let title = this.generateTitleFromUrl(url);
        let description = this.generateSmartDescription(title, platform, url);
        
        const metadata = {
            platform: platform,
            title: title,
            description: description,
            favicon: this.getPlatformIcon(platform),
            tags: [platform.toLowerCase(), ...this.generateTagsFromTitle(title)],
            content: this.generateContentFromTitle(title, platform)
        };

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return metadata;
    }

    generateSmartDescription(title, platform, url) {
        // Generate contextual descriptions based on document type
        const titleLower = title.toLowerCase();
        
        // Detect document type from title
        if (titleLower.includes('status') || titleLower.includes('report')) {
            return `${platform} status report - Track progress, updates, and key metrics`;
        } else if (titleLower.includes('meeting') || titleLower.includes('notes')) {
            return `Meeting notes from team discussion - Decisions, action items, and key takeaways`;
        } else if (titleLower.includes('api') || titleLower.includes('documentation')) {
            return `Technical documentation - API endpoints, integration guides, and code examples`;
        } else if (titleLower.includes('design') || titleLower.includes('ui') || titleLower.includes('ux')) {
            return `Design document - UI/UX guidelines, mockups, and design specifications`;
        } else if (titleLower.includes('requirement') || titleLower.includes('spec')) {
            return `Requirements document - Features, specifications, and acceptance criteria`;
        } else if (titleLower.includes('plan') || titleLower.includes('planning')) {
            return `Planning document - Strategy, roadmap, and execution plan`;
        } else if (titleLower.includes('research') || titleLower.includes('analysis')) {
            return `Research findings - Data analysis, insights, and recommendations`;
        } else if (titleLower.includes('onboarding') || titleLower.includes('guide')) {
            return `Guide or onboarding document - Step-by-step instructions and best practices`;
        } else if (titleLower.includes('review') || titleLower.includes('feedback')) {
            return `Review document - Feedback, comments, and improvement suggestions`;
        } else if (titleLower.includes('proposal') || titleLower.includes('rfc')) {
            return `Proposal document - Ideas, recommendations, and implementation approach`;
        } else {
            // Generic but informative description
            return `${platform} collaborative document - Shared workspace for team collaboration`;
        }
    }

    extractQuipTitle(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            
            // Quip URLs format: https://quip.com/ABC123DEF/Document-Title-Here
            if (pathParts.length >= 2) {
                const titlePart = pathParts[1];
                if (titlePart && titlePart.length > 3 && !titlePart.match(/^[A-Z0-9]+$/)) {
                    return titlePart
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .trim();
                }
            }
            
            // Try to extract from URL parameters or hash
            const urlParams = new URLSearchParams(urlObj.search);
            if (urlParams.has('title')) {
                return urlParams.get('title').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            
            return null;
        } catch {
            return null;
        }
    }

    generateTagsFromTitle(title) {
        const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'];
        const words = title.toLowerCase().split(/\s+/)
            .filter(word => word.length > 2 && !commonWords.includes(word))
            .slice(0, 3); // Take first 3 meaningful words as tags
        
        return words;
    }

    generateContentFromTitle(title, platform) {
        // Generate searchable content based on title and platform
        const titleWords = title.toLowerCase();
        const platformContent = platform.toLowerCase();
        
        // Add common document-related terms for better searchability
        const commonTerms = ['document', 'notes', 'guide', 'documentation', 'meeting', 'project', 'requirements'];
        const relevantTerms = commonTerms.filter(term => titleWords.includes(term.substring(0, 4)));
        
        return `${titleWords} ${platformContent} ${relevantTerms.join(' ')} content text information`;
    }

    detectPlatform(url) {
        const urlLower = url.toLowerCase();
        
        if (urlLower.includes('quip.com')) return 'Quip';
        if (urlLower.includes('docs.google.com')) return 'Google';
        if (urlLower.includes('confluence')) return 'Confluence';
        if (urlLower.includes('notion.so')) return 'Notion';
        if (urlLower.includes('sharepoint')) return 'SharePoint';
        if (urlLower.includes('dropbox.com/paper')) return 'Dropbox Paper';
        
        return 'Other';
    }

    generateTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            
            // Special handling for Quip URLs
            if (urlObj.hostname.includes('quip.com')) {
                // Quip URLs often have the title in the path after the ID
                // Format: https://quip.com/ABC123DEF/Document-Title-Here
                if (pathParts.length >= 2) {
                    const titlePart = pathParts[1]; // Get the part after the ID
                    if (titlePart && titlePart !== pathParts[0]) { // Make sure it's not just the ID
                        return titlePart
                            .replace(/[-_]/g, ' ')
                            .replace(/\b\w/g, l => l.toUpperCase())
                            .trim();
                    }
                }
                
                // If no title found in URL, try to extract from fragment or search params
                if (urlObj.hash) {
                    const hashTitle = urlObj.hash.substring(1).replace(/[-_]/g, ' ');
                    if (hashTitle.length > 3) {
                        return hashTitle.replace(/\b\w/g, l => l.toUpperCase());
                    }
                }
                
                // Fallback for Quip
                return 'Quip Document';
            }
            
            // Handle Google Docs URLs
            if (urlObj.hostname.includes('docs.google.com')) {
                // Google Docs URLs sometimes have titles in the path
                const docPart = pathParts.find(part => part !== 'd' && part !== 'document' && part !== 'edit' && part.length > 10);
                if (docPart) {
                    return 'Google Doc';
                }
                return 'Google Document';
            }
            
            // Handle Confluence URLs
            if (urlObj.hostname.includes('confluence')) {
                // Confluence URLs often have titles at the end
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart && lastPart.length > 3) {
                    return lastPart
                        .replace(/[-_+]/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .trim();
                }
                return 'Confluence Page';
            }
            
            // Generic handling for other URLs
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart && lastPart.length > 3) {
                return lastPart.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            
            return urlObj.hostname.replace('www.', '');
        } catch {
            return 'Untitled Document';
        }
    }

    getPlatformIcon(platform) {
        const icons = {
            'Quip': 'https://quip.com/favicon.ico',
            'Google': 'https://docs.google.com/favicon.ico',
            'Confluence': 'https://confluence.atlassian.com/favicon.ico',
            'Notion': 'https://notion.so/favicon.ico',
            'SharePoint': 'https://sharepoint.com/favicon.ico',
            'Dropbox Paper': 'https://dropbox.com/favicon.ico'
        };
        
        return icons[platform] || 'https://via.placeholder.com/24x24?text=📄';
    }

    previewLink(url) {
        const preview = document.getElementById('linkPreview');
        const titleInput = document.getElementById('titleInput');
        const customTitle = titleInput.value.trim();
        
        if (!url || !this.isValidUrl(url)) {
            this.hidePreview();
            return;
        }

        const platform = this.detectPlatform(url);
        const autoTitle = this.generateTitleFromUrl(url);
        const displayTitle = customTitle || autoTitle;
        
        preview.innerHTML = `
            <div class="preview-header">
                <img src="${this.getPlatformIcon(platform)}" alt="${platform}" class="platform-icon" onerror="this.style.display='none'">
                <span class="preview-title">${displayTitle}</span>
                ${customTitle ? '<span class="custom-title-badge">Custom Title</span>' : ''}
            </div>
            <div class="preview-description">Document from ${platform}${customTitle ? ' (using custom title)' : ''}</div>
            <div class="preview-url">${url}</div>
        `;
        
        preview.classList.remove('hidden');
    }

    hidePreview() {
        document.getElementById('linkPreview').classList.add('hidden');
    }

    searchBookmarks(query = null) {
        const searchInput = document.getElementById('searchInput');
        const searchQuery = query !== null ? query : searchInput.value.trim().toLowerCase();
        
        this.currentPage = 1; // Reset pagination on search
        
        if (!searchQuery) {
            this.renderBookmarks();
            return;
        }

        const results = this.performNLPSearch(searchQuery);
        this.renderBookmarks(results);
    }

    performNLPSearch(query) {
        const originalQuery = query.toLowerCase().trim();
        const queryWords = originalQuery.split(/\s+/).filter(word => word.length > 1);
        const results = [];

        this.bookmarks.forEach(bookmark => {
            let score = 0;
            const titleLower = bookmark.title.toLowerCase();
            const descriptionLower = bookmark.description.toLowerCase();
            const platformLower = bookmark.platform.toLowerCase();
            const tagsLower = bookmark.tags.join(' ').toLowerCase();
            const contentLower = bookmark.content.toLowerCase();
            const searchableText = `${titleLower} ${descriptionLower} ${platformLower} ${tagsLower} ${contentLower}`;
            
            // TITLE MATCHING (Highest Priority)
            // Exact title match gets massive boost
            if (titleLower === originalQuery) {
                score += 1000;
            }
            // Title contains exact phrase
            else if (titleLower.includes(originalQuery)) {
                score += 500;
            }
            // Title starts with query
            else if (titleLower.startsWith(originalQuery)) {
                score += 400;
            }
            // Title ends with query
            else if (titleLower.endsWith(originalQuery)) {
                score += 300;
            }

            // Individual word matching in title (very high priority)
            let titleWordMatches = 0;
            queryWords.forEach(word => {
                if (titleLower.includes(word)) {
                    titleWordMatches++;
                    // Exact word boundary match in title
                    const titleWords = titleLower.split(/\s+/);
                    if (titleWords.includes(word)) {
                        score += 150; // Much higher than before
                    } else {
                        score += 100; // Partial word match in title
                    }
                }
                
                // Fuzzy matching in title
                if (this.fuzzyMatch(word, titleLower)) {
                    score += 80;
                }
            });

            // Bonus for multiple word matches in title
            if (titleWordMatches > 1) {
                score += titleWordMatches * 50;
            }

            // Complete query match bonus (all words found in title)
            if (queryWords.length > 1 && queryWords.every(word => titleLower.includes(word))) {
                score += 200;
            }

            // DESCRIPTION MATCHING (Medium Priority)
            if (descriptionLower.includes(originalQuery)) {
                score += 80;
            }
            queryWords.forEach(word => {
                if (descriptionLower.includes(word)) {
                    score += 25;
                }
                if (this.fuzzyMatch(word, descriptionLower)) {
                    score += 15;
                }
            });

            // CONTENT MATCHING (Lower Priority)
            if (contentLower.includes(originalQuery)) {
                score += 40;
            }
            queryWords.forEach(word => {
                if (contentLower.includes(word)) {
                    score += 10;
                }
                if (this.fuzzyMatch(word, contentLower)) {
                    score += 5;
                }
            });

            // PLATFORM MATCHING
            if (queryWords.some(word => platformLower.includes(word))) {
                score += 30;
            }

            // TAGS MATCHING (Enhanced Priority)
            // Exact tag match gets high score
            const tags = bookmark.tags || [];
            queryWords.forEach(word => {
                tags.forEach(tag => {
                    if (tag.toLowerCase() === word) {
                        score += 200; // Exact tag match - very high priority
                    } else if (tag.toLowerCase().includes(word)) {
                        score += 100; // Partial tag match
                    }
                });
                
                // General tag text matching
                if (tagsLower.includes(word)) {
                    score += 50;
                }
            });

            // Bonus for matching custom tags (user-defined)
            if (bookmark.customTags && bookmark.customTags.length > 0) {
                const customTagsLower = bookmark.customTags.join(' ').toLowerCase();
                queryWords.forEach(word => {
                    if (customTagsLower.includes(word)) {
                        score += 150; // Extra boost for custom tags
                    }
                });
            }

            // Length penalty for very long queries that partially match
            if (queryWords.length > 3 && score < 100) {
                score *= 0.8;
            }

            // Boost recent documents slightly if scores are close
            const daysSinceAdded = Math.floor((Date.now() - new Date(bookmark.addedDate).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceAdded < 7) {
                score += Math.max(0, 10 - daysSinceAdded);
            }

            if (score > 0) {
                results.push({ ...bookmark, rawScore: score });
            }
        });

        // Sort by raw score first
        results.sort((a, b) => b.rawScore - a.rawScore);

        // Normalize scores to 0-100 scale
        if (results.length > 0) {
            const maxScore = results[0].rawScore;
            results.forEach(result => {
                // Normalize to 100, with minimum of 1 for any match
                result.searchScore = Math.max(1, Math.min(100, Math.round((result.rawScore / maxScore) * 100)));
            });
        }

        return results;
    }

    fuzzyMatch(word, text) {
        // Improved fuzzy matching with better tolerance for typos
        const words = text.split(/\s+/);
        return words.some(textWord => {
            // Skip if length difference is too large
            if (Math.abs(textWord.length - word.length) > 2) return false;
            
            // Exact match
            if (textWord === word) return true;
            
            // Check if one word contains the other (for partial matches)
            if (word.length >= 3 && (textWord.includes(word) || word.includes(textWord))) {
                return true;
            }
            
            // Levenshtein distance calculation for typos
            return this.calculateLevenshteinDistance(word, textWord) <= 2;
        });
    }

    calculateLevenshteinDistance(str1, str2) {
        const matrix = [];
        
        // Initialize first row and column
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        // Fill the matrix
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.currentPage = 1; // Reset pagination
        this.renderBookmarks();
    }

    renderStats() {
        const statsGrid = document.getElementById('statsGrid');
        if (!this.bookmarks || this.bookmarks.length === 0) {
            statsGrid.innerHTML = '';
            return;
        }

        const stats = this.calculateStats();
        
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.total}</div>
                <div class="stat-label">Total Bookmarks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.thisWeek}</div>
                <div class="stat-label">Added This Week</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.topPlatform}</div>
                <div class="stat-label">Top Platform</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.uniqueTags}</div>
                <div class="stat-label">Unique Tags</div>
            </div>
        `;
    }

    calculateStats() {
        const total = this.bookmarks.length;
        
        // Count added this week
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const thisWeek = this.bookmarks.filter(b => new Date(b.addedDate).getTime() > weekAgo).length;
        
        // Find top platform
        const platformCounts = {};
        this.bookmarks.forEach(b => {
            platformCounts[b.platform] = (platformCounts[b.platform] || 0) + 1;
        });
        const topPlatform = Object.keys(platformCounts).reduce((a, b) => 
            platformCounts[a] > platformCounts[b] ? a : b, 'None'
        );
        
        // Count unique tags
        const allTags = new Set();
        this.bookmarks.forEach(b => {
            if (b.customTags) {
                b.customTags.forEach(tag => allTags.add(tag));
            }
        });
        
        return {
            total,
            thisWeek,
            topPlatform,
            uniqueTags: allTags.size
        };
    }

    toggleCompactView() {
        this.isCompactView = !this.isCompactView;
        const compactToggle = document.getElementById('compactToggle');
        compactToggle.classList.toggle('active', this.isCompactView);
        
        const bookmarksList = document.getElementById('bookmarksList');
        bookmarksList.classList.toggle('compact', this.isCompactView);
    }

    toggleGroupView() {
        this.isGroupedView = !this.isGroupedView;
        const groupToggle = document.getElementById('groupToggle');
        groupToggle.classList.toggle('active', this.isGroupedView);
        
        this.currentPage = 1; // Reset pagination
        this.renderBookmarks();
    }

    loadMore() {
        this.currentPage++;
        this.renderBookmarks();
    }

    renderBookmarks(bookmarks = null) {
        const bookmarksList = document.getElementById('bookmarksList');
        const resultsCount = document.getElementById('resultsCount');
        const pagination = document.getElementById('pagination');
        const bookmarksToRender = bookmarks || this.getFilteredBookmarks();
        
        if (bookmarksToRender.length === 0) {
            bookmarksList.innerHTML = `
                <div class="empty-state">
                    <img src="bookmark-illustration.svg" alt="Bookmark" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27%234b6cb7%27%3E%3Cpath d=%27M6 2h9a3 3 0 0 1 3 3v15.4a1 1 0 0 1-1.6.8L12 18.7l-4.4 2.5a1 1 0 0 1-1.6-.8V5a3 3 0 0 1 3-3Z%27/%3E%3C/svg%3E'" />
                    <h2>${bookmarks ? 'No results found' : 'No bookmarks yet'}</h2>
                    <p>${bookmarks ? 'Try adjusting your search terms' : 'Paste your first link above to get started.'}</p>
                </div>
            `;
            resultsCount.textContent = '';
            pagination.style.display = 'none';
            return;
        }

        // Render grouped view or normal view
        if (this.isGroupedView) {
            this.renderGroupedBookmarks(bookmarksToRender);
        } else {
            this.renderNormalBookmarks(bookmarksToRender);
        }

        // Update results count
        resultsCount.textContent = `Showing ${Math.min(this.currentPage * this.itemsPerPage, bookmarksToRender.length)} of ${bookmarksToRender.length}`;
        
        // Update stats
        this.renderStats();
    }

    renderNormalBookmarks(bookmarksToRender) {
        const bookmarksList = document.getElementById('bookmarksList');
        const pagination = document.getElementById('pagination');
        
        // Pagination logic
        const totalPages = Math.ceil(bookmarksToRender.length / this.itemsPerPage);
        const endIndex = this.currentPage * this.itemsPerPage;
        const paginatedBookmarks = bookmarksToRender.slice(0, endIndex);
        
        bookmarksList.innerHTML = paginatedBookmarks.map(bookmark => 
            this.renderBookmarkCard(bookmark)
        ).join('');
        
        // Show/hide load more button
        if (endIndex < bookmarksToRender.length) {
            pagination.style.display = 'block';
            const remaining = bookmarksToRender.length - endIndex;
            document.getElementById('loadMore').innerHTML = `
                <i class="fas fa-chevron-down"></i> Load More (${remaining} remaining)
            `;
        } else {
            pagination.style.display = 'none';
        }
    }

    renderGroupedBookmarks(bookmarksToRender) {
        const bookmarksList = document.getElementById('bookmarksList');
        const pagination = document.getElementById('pagination');
        pagination.style.display = 'none'; // Hide pagination in grouped view
        
        // Group by tags
        const groups = this.groupBookmarksByTag(bookmarksToRender);
        
        bookmarksList.innerHTML = groups.map(group => `
            <div class="tag-group">
                <div class="tag-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                    <div class="tag-group-title">
                        <i class="fas fa-tag"></i>
                        <span>${group.name}</span>
                    </div>
                    <span class="tag-group-count">${group.bookmarks.length}</span>
                </div>
                <div class="tag-group-content">
                    ${group.bookmarks.map(bookmark => this.renderBookmarkCard(bookmark)).join('')}
                </div>
            </div>
        `).join('');
    }

    renderBookmarkCard(bookmark) {
        return `
            <div class="bookmark-card fade-in" data-id="${bookmark.id}">
                <div class="bookmark-header">
                    <div class="bookmark-info">
                        <span class="bookmark-platform ${bookmark.platform.toLowerCase()}">${bookmark.platform}</span>
                        <span class="bookmark-title">${this.highlightSearchTerms(bookmark.title)}</span>
                    </div>
                    <div class="bookmark-actions">
                        <button class="action-btn" onclick="bookmarkManager.openBookmark('${bookmark.url}')" title="Open">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="bookmarkManager.deleteBookmark('${bookmark.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="bookmark-description">${this.highlightSearchTerms(bookmark.description)}</div>
                ${this.renderTags(bookmark)}
                <div class="bookmark-meta">
                    <span>Added ${this.formatDate(bookmark.addedDate)}</span>
                    ${bookmark.searchScore ? `<span class="relevance-score">${bookmark.searchScore}% match</span>` : ''}
                </div>
            </div>
        `;
    }

    groupBookmarksByTag(bookmarks) {
        const groups = {};
        
        bookmarks.forEach(bookmark => {
            if (bookmark.customTags && bookmark.customTags.length > 0) {
                bookmark.customTags.forEach(tag => {
                    if (!groups[tag]) {
                        groups[tag] = [];
                    }
                    groups[tag].push(bookmark);
                });
            } else {
                if (!groups['Untagged']) {
                    groups['Untagged'] = [];
                }
                groups['Untagged'].push(bookmark);
            }
        });
        
        // Convert to array and sort by count
        return Object.keys(groups)
            .map(tag => ({ name: tag, bookmarks: groups[tag] }))
            .sort((a, b) => b.bookmarks.length - a.bookmarks.length);
    }

    renderTags(bookmark) {
        if (!bookmark.customTags || bookmark.customTags.length === 0) {
            return '';
        }

        const tagsHtml = bookmark.customTags.map(tag => 
            `<span class="tag"><i class="fas fa-tag"></i>${this.highlightSearchTerms(tag)}</span>`
        ).join('');

        return `<div class="bookmark-tags">${tagsHtml}</div>`;
    }

    highlightSearchTerms(text) {
        const searchQuery = document.getElementById('searchInput').value.trim();
        if (!searchQuery) return text;

        const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(word => word.length > 2);
        let highlightedText = text;

        queryWords.forEach(word => {
            const regex = new RegExp(`(${word})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<span class="highlight">$1</span>');
        });

        return highlightedText;
    }

    getFilteredBookmarks() {
        if (this.currentFilter === 'all') {
            return this.bookmarks;
        }
        
        return this.bookmarks.filter(bookmark => 
            bookmark.platform.toLowerCase() === this.currentFilter
        );
    }

    openBookmark(url) {
        window.open(url, '_blank');
    }

    deleteBookmark(id) {
        if (confirm('Are you sure you want to delete this bookmark?')) {
            this.bookmarks = this.bookmarks.filter(bookmark => bookmark.id !== id);
            this.saveBookmarks();
            this.buildSearchIndex();
            this.currentPage = 1; // Reset pagination
            this.renderStats();
            this.renderBookmarks();
            this.showToast('Bookmark deleted', 'success');
        }
    }

    buildSearchIndex() {
        this.searchIndex.clear();
        this.bookmarks.forEach(bookmark => {
            const searchableText = `${bookmark.title} ${bookmark.description} ${bookmark.platform} ${bookmark.tags.join(' ')} ${bookmark.content}`.toLowerCase();
            const words = searchableText.split(/\s+/).filter(word => word.length > 2);
            
            words.forEach(word => {
                if (!this.searchIndex.has(word)) {
                    this.searchIndex.set(word, []);
                }
                this.searchIndex.get(word).push(bookmark.id);
            });
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'today';
        if (diffDays === 2) return 'yesterday';
        if (diffDays <= 7) return `${diffDays} days ago`;
        
        return date.toLocaleDateString();
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.toggle('hidden', !show);
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    loadBookmarks() {
        try {
            const stored = localStorage.getItem('documentBookmarks');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading bookmarks:', error);
            return [];
        }
    }

    saveBookmarks() {
        try {
            localStorage.setItem('documentBookmarks', JSON.stringify(this.bookmarks));
        } catch (error) {
            console.error('Error saving bookmarks:', error);
            this.showToast('Failed to save bookmarks', 'error');
        }
    }
}

// Initialize the application
let bookmarkManager;
document.addEventListener('DOMContentLoaded', () => {
    bookmarkManager = new DocumentBookmarkManager();
});

// Add some sample data for demonstration
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (bookmarkManager.bookmarks.length === 0) {
            // Add sample bookmarks for demonstration
            const sampleBookmarks = [
                {
                    id: 'sample1',
                    url: 'https://docs.google.com/document/d/sample1',
                    title: 'Project Requirements Document',
                    description: 'Requirements document - Features, specifications, and acceptance criteria',
                    platform: 'Google',
                    favicon: 'https://docs.google.com/favicon.ico',
                    addedDate: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
                    tags: ['project', 'requirements', 'project-alpha', 'q4-2024'],
                    customTags: ['project-alpha', 'q4-2024'],
                    content: 'project requirements feature implementation specifications user stories acceptance criteria project-alpha q4-2024'
                },
                {
                    id: 'sample2',
                    url: 'https://quip.com/sample-meeting-notes',
                    title: 'Weekly Team Meeting Notes',
                    description: 'Meeting notes from team discussion - Decisions, action items, and key takeaways',
                    platform: 'Quip',
                    favicon: 'https://quip.com/favicon.ico',
                    addedDate: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
                    tags: ['meeting', 'notes', 'project-alpha', 'team-sync'],
                    customTags: ['project-alpha', 'team-sync'],
                    content: 'team meeting notes weekly sync discussion points action items decisions project-alpha team-sync'
                },
                {
                    id: 'sample3',
                    url: 'https://confluence.company.com/design-system',
                    title: 'Design System Guidelines',
                    description: 'Design document - UI/UX guidelines, mockups, and design specifications',
                    platform: 'Confluence',
                    favicon: 'https://confluence.atlassian.com/favicon.ico',
                    addedDate: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
                    tags: ['design', 'guidelines'],
                    content: 'design system UI components guidelines branding colors typography buttons forms'
                },
                {
                    id: 'sample4',
                    url: 'https://docs.google.com/document/d/api-documentation',
                    title: 'API Documentation v2.0',
                    description: 'Technical documentation - API endpoints, integration guides, and code examples',
                    platform: 'Google',
                    favicon: 'https://docs.google.com/favicon.ico',
                    addedDate: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
                    tags: ['api', 'documentation', 'technical', 'backend', 'project-alpha'],
                    customTags: ['backend', 'project-alpha'],
                    content: 'API documentation endpoints authentication requests responses examples swagger backend project-alpha'
                },
                {
                    id: 'sample5',
                    url: 'https://quip.com/user-research-findings',
                    title: 'User Research Findings Q3 2024',
                    description: 'Research findings - Data analysis, insights, and recommendations',
                    platform: 'Quip',
                    favicon: 'https://quip.com/favicon.ico',
                    addedDate: new Date(Date.now() - 432000000).toISOString(), // 5 days ago
                    tags: ['research', 'user', 'insights'],
                    content: 'user research findings insights interviews surveys usability testing feedback'
                },
                {
                    id: 'sample6',
                    url: 'https://confluence.company.com/onboarding-guide',
                    title: 'New Employee Onboarding Guide',
                    description: 'Guide or onboarding document - Step-by-step instructions and best practices',
                    platform: 'Confluence',
                    favicon: 'https://confluence.atlassian.com/favicon.ico',
                    addedDate: new Date(Date.now() - 518400000).toISOString(), // 6 days ago
                    tags: ['onboarding', 'hr', 'guide'],
                    content: 'employee onboarding guide process checklist orientation training setup'
                }
            ];
            
            bookmarkManager.bookmarks = sampleBookmarks;
            bookmarkManager.saveBookmarks();
            bookmarkManager.buildSearchIndex();
            bookmarkManager.renderBookmarks();
        }
    }, 500);
});
