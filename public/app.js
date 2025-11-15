// Initialize Firebase
const auth = firebase.auth();

let calendarData = null;
let authToken = localStorage.getItem('authToken');
let availableYears = [];
let currentYear = null;
let isYearMenuOpen = false;

// Password protection
const passwordInput = document.getElementById('passwordInput');
const submitButton = document.getElementById('submitPassword');
const passwordOverlay = document.getElementById('passwordOverlay');
const mainContent = document.getElementById('mainContent');
const yearSelectWrapper = document.getElementById('yearSelectWrapper');
const yearSelectToggle = document.getElementById('yearSelectToggle');
const yearSelectLabel = document.getElementById('yearSelectLabel');
const yearSelectList = document.getElementById('yearSelectList');

const closeYearMenu = () => {
    if (!isYearMenuOpen) {
        return;
    }

    isYearMenuOpen = false;
    if (yearSelectList) {
        yearSelectList.classList.remove('open');
    }
    if (yearSelectToggle) {
        yearSelectToggle.setAttribute('aria-expanded', 'false');
    }
};

const openYearMenu = () => {
    if (isYearMenuOpen || !yearSelectList || !yearSelectToggle) {
        return;
    }

    isYearMenuOpen = true;
    yearSelectList.classList.add('open');
    yearSelectToggle.setAttribute('aria-expanded', 'true');
};

const toggleYearMenu = () => {
    if (isYearMenuOpen) {
        closeYearMenu();
    } else {
        openYearMenu();
    }
};

async function handleYearSelection(year) {
    if (!year || year === currentYear) {
        closeYearMenu();
        return;
    }

    currentYear = year;
    localStorage.setItem('selectedYear', currentYear);
    closeYearMenu();

    try {
        await loadCalendarData();
    } catch (error) {
        console.error('Failed to switch calendar year:', error);
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, setting up event listeners');
    
    // Set impressum content
    document.getElementById('authors').textContent = siteConfig.authors;
    const sourceLink = document.getElementById('sourceLink');
    sourceLink.href = siteConfig.sourceUrl;
    sourceLink.textContent = siteConfig.sourceUrl;
    
    // Setup logout button
    const logoutButton = document.getElementById('logoutButton');
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        location.reload();
    });

    
    // Focus the password input with a slight delay on mobile
    setTimeout(() => {
        passwordInput.focus();
        // Scroll to ensure the input is visible
        passwordInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);

    // Handle input focus on overlay click
    passwordOverlay.addEventListener('click', (e) => {
        if (e.target === passwordOverlay) {
            passwordInput.focus();
        }
    });

    // Add form submit event instead of keypress
    const form = document.createElement('form');
    form.id = 'passwordForm';
    passwordInput.parentNode.insertBefore(form, passwordInput);
    form.appendChild(passwordInput);
    form.appendChild(submitButton);
    
    form.addEventListener('submit', (e) => {
        console.log('Form submitted');
        e.preventDefault();
        checkPassword();
    });
    
    // Start animations
    startRandomSwirl();
    
    // Set up modal events
    const modal = document.getElementById('imageModal');
    document.querySelector('.close-button').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    if (yearSelectToggle && yearSelectList) {
        yearSelectToggle.addEventListener('click', toggleYearMenu);
    }

    document.addEventListener('click', (event) => {
        if (!isYearMenuOpen) {
            return;
        }

        if (yearSelectWrapper && !yearSelectWrapper.contains(event.target)) {
            closeYearMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeYearMenu();
        }
    });
    
    // Check if already authenticated
    checkAuth();
});

const updateYearSelectOptions = () => {
    if (!yearSelectList) {
        if (yearSelectLabel) {
            yearSelectLabel.textContent = currentYear || 'Year';
        }
        return;
    }

    yearSelectList.innerHTML = '';
    availableYears.forEach((year) => {
        const option = document.createElement('li');
        option.textContent = year;
        option.dataset.year = year;
        option.setAttribute('role', 'option');
        option.tabIndex = -1;
        option.className = 'year-option';

        if (year === currentYear) {
            option.classList.add('active');
        }

        option.addEventListener('click', () => {
            handleYearSelection(year);
        });

        yearSelectList.appendChild(option);
    });

    if (yearSelectLabel) {
        yearSelectLabel.textContent = currentYear || 'Year';
    }
};

const loadAvailableYears = async () => {
    console.log('Loading available years...');
    const response = await fetch('/api/available-years', {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (!response.ok) {
        if (response.status === 401) {
            showPasswordOverlay();
        }
        throw new Error('Failed to fetch available years');
    }

    const data = await response.json();
    availableYears = (data.years || [])
        .map((year) => year.toString())
        .sort((a, b) => b.localeCompare(a));

    if (!availableYears.length) {
        throw new Error('No calendar years available');
    }

    const storedYear = localStorage.getItem('selectedYear');
    if (storedYear && availableYears.includes(storedYear)) {
        currentYear = storedYear;
    } else {
        currentYear = availableYears[0];
        localStorage.setItem('selectedYear', currentYear);
    }

    updateYearSelectOptions();
};

const initializeCalendarView = async () => {
    try {
        await loadAvailableYears();
        await loadCalendarData();
    } catch (error) {
        console.error('Failed to initialize calendar view:', error);
    }
};

// Check if already authenticated
const checkAuth = async () => {
    try {
        console.log('Checking authentication status...');
        if (!authToken) {
            console.log('No token found in storage');
            throw new Error('No token found');
        }

        console.log('Verifying stored token');
        const response = await fetch('/verify-auth', {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('Auth verification response:', response.status);
        const data = await response.json().catch(() => ({ error: 'Failed to parse response' }));
        console.log('Auth verification data:', data);

        if (data.authenticated) {
            console.log('Token verified successfully');
            hidePasswordOverlay();
            await initializeCalendarView();
        } else {
            console.log('Token verification failed');
            localStorage.removeItem('authToken');
            authToken = null;
            showPasswordOverlay();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('authToken');
        authToken = null;
        showPasswordOverlay();
    }
};

async function checkPassword() {
    console.log('checkPassword function called');
    if (!passwordInput.value) {
        console.log('No password entered');
        return;
    }

    console.log('Attempting login with password length:', passwordInput.value.length);
    try {
        const response = await fetch('/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ password: passwordInput.value })
        });

        console.log('Login response status:', response.status);
        const data = await response.json();
        console.log('Login response data:', data);

        if (data.success && data.token) {
            console.log('Login successful, token received');
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            hidePasswordOverlay();
            await initializeCalendarView();
        } else {
            console.error('Login failed:', data.error);
            throw new Error(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        passwordInput.value = '';
        passwordInput.placeholder = error.message || 'Server error, please try again';
        passwordInput.classList.add('error');
        setTimeout(() => {
            passwordInput.placeholder = 'Enter password';
            passwordInput.classList.remove('error');
        }, 2000);
    }
}

async function loadCalendarData() {
    if (!currentYear) {
        console.warn('No year selected, attempting to use most recent available year');
        if (availableYears.length) {
            currentYear = availableYears[0];
        } else {
            await loadAvailableYears();
        }
    }

    try {
        console.log(`Loading calendar data for ${currentYear}...`);
        const query = currentYear ? `?year=${currentYear}` : '';
        const response = await fetch(`/api/calendar-data${query}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                showPasswordOverlay();
            }
            throw new Error(`Failed to load calendar data (${response.status})`);
        }

        const data = await response.json();
        console.log('Calendar data received:', data);
        calendarData = data.doors || {};

        if (data.year && data.year !== currentYear) {
            currentYear = data.year;
            localStorage.setItem('selectedYear', currentYear);
        }

        updateYearSelectOptions();
        createCalendar();
    } catch (error) {
        console.error('Error loading calendar data:', error);
    }
}

function showPasswordOverlay() {
    passwordOverlay.style.display = 'flex';
    mainContent.style.display = 'none';
    // Clear any existing content for security
    document.getElementById('calendar-grid').innerHTML = '';
}

function hidePasswordOverlay() {
    passwordOverlay.style.display = 'none';
    mainContent.style.display = 'block';
    
    // Enable dark mode by default
    document.body.classList.add('dark-mode');
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
    
    // Start animations
    startRandomSwirl();
    startSnowfall();
    startShootingStars();
}

// Create calendar grid
function createCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = ''; // Clear existing content
    
    if (!calendarData) {
        grid.innerHTML = '<p class="calendar-empty">No calendar data available.</p>';
        return;
    }

    // Festive icons for each door
    const icons = [
        'fa-menorah',          // 1
        'fa-star',          // 2
        'fa-tree',          // 3
        'fa-bell',          // 4
        'fa-snowflake',     // 5
        'fa-gift',    // 6
        'fa-holly-berry',   // 7
        'fa-sleigh',        // 8
        'fa-moon',          // 9
        'fa-cookie-bite',   // 10
        'fa-mitten',        // 11
        'fa-wind',          // 12
        'fa-hat-wizard',    // 13
        'fa-dove',          // 14
        'fa-snowman',       // 15
        'fa-music',         // 16
        'fa-heart',         // 17
        'fa-star-of-david', // 18
        'fa-candy-cane',    // 19
        'fa-fire',          // 20
        'fa-church',        // 21
        'fa-house',         // 22
        'fa-face-smile',    // 23
        'fa-gifts',         // 24
    ];

    for (let i = 1; i <= 24; i++) {
        const door = document.createElement('div');
        door.className = 'door';
        door.setAttribute('data-day', i);  // Add data-day attribute for color
        
        // Add day number
        const dayNumber = document.createElement('span');
        dayNumber.className = 'day-number';
        dayNumber.textContent = i;
        door.appendChild(dayNumber);
        
        const locked = isDoorLocked(i);
        const doorData = calendarData[i.toString()];

        if (doorData?.legend) {
            door.title = doorData.legend;
        }

        if (locked) {
            door.classList.add('unavailable');
        } else {
            door.addEventListener('click', () => openDoor(i));

            // Create icon element
            const icon = document.createElement('i');
            icon.className = `fas ${icons[i-1]}`;
            door.appendChild(icon);
        }
        
        grid.appendChild(door);
    }
}

function isDoorLocked(day) {
    if (!currentYear) {
        return true;
    }

    const viewingYear = parseInt(currentYear, 10);
    if (Number.isNaN(viewingYear)) {
        return true;
    }

    const now = new Date();
    if (viewingYear < now.getFullYear()) {
        return false;
    }

    if (viewingYear > now.getFullYear()) {
        return true;
    }

    if (now.getMonth() !== 10) {
        return true;
    }

    return now.getDate() < day;
}

// Handle door opening
async function openDoor(day) {
    try {
        console.log('Opening door:', day);
        const yearQuery = currentYear ? `?year=${currentYear}` : '';

        // First get the door data
        const response = await fetch(`/api/door/${day}${yearQuery}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            console.error('Door response not ok:', response.status);
            if (response.status === 401) {
                showPasswordOverlay();
                return;
            }
            if (response.status === 404) {
                throw new Error('This door cannot be opened yet!');
            }
            throw new Error('Failed to load door content');
        }

        const doorData = await response.json();
        console.log('Door data received:', doorData);

        if (!doorData || !doorData.legend) {
            console.error('Invalid door data received');
            throw new Error('Invalid door data');
        }

        // Now fetch the image
        console.log('Fetching image for door:', day);
        const imageResponse = await fetch(`/api/door/${day}/image${yearQuery}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!imageResponse.ok) {
            console.error('Image response not ok:', imageResponse.status);
            throw new Error('Failed to load door image');
        }

        // Convert the image data to blob and create URL
        const imageBlob = await imageResponse.blob();
        const imageUrl = URL.createObjectURL(imageBlob);

        // Update modal content
        const modalImg = document.getElementById('modalImage');
        const modal = document.getElementById('imageModal');
        const modalContent = document.querySelector('.modal-content');
        const modalLegend = document.getElementById('modalLegend');
        
        // Get the door's color from CSS
        const doorElement = document.querySelector(`.door[data-day="${day}"]`);
        if (!doorElement) {
            throw new Error('Door element not found');
        }
        const doorColor = getComputedStyle(doorElement).backgroundColor;
        modalContent.style.backgroundColor = doorColor;
        
        // Set the image and legend
        modalImg.src = imageUrl;
        modalLegend.textContent = doorData.legend;
        
        // Show the modal
        modal.style.display = 'block';

        // Clean up the object URL when the image is loaded
        modalImg.onload = () => {
            URL.revokeObjectURL(imageUrl);
        };

    } catch (error) {
        console.error('Error opening door:', error);
        alert(error.message || 'An error occurred while opening the door. Please try again.');
    }
}

// Close modal when clicking the close button or outside the modal
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('imageModal');
    
    document.querySelector('.close-button').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Dark mode toggle
document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('themeToggle').innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
    
    if (isDark) {
        startSnowfall();
        startShootingStars();
    } else {
        stopSnowfall();
        stopShootingStars();
    }
});

// Initialize theme from localStorage
document.addEventListener('DOMContentLoaded', () => {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        startSnowfall();
        startShootingStars();
    }
});

// Snowfall effect
let snowInterval;
function startSnowfall() {
    snowInterval = setInterval(createSnowflake, 500);
}

function stopSnowfall() {
    clearInterval(snowInterval);
    document.querySelectorAll('.snowflake').forEach(snow => snow.remove());
}

function createSnowflake() {
    const snow = document.createElement('div');
    snow.className = 'snowflake';
    snow.innerHTML = '❄';
    snow.style.left = Math.random() * 100 + 'vw';
    snow.style.animation = `snowfall ${Math.random() * 13 + 22}s linear`;
    document.body.appendChild(snow);
    
    snow.addEventListener('animationend', () => snow.remove());
}

// Shooting stars
let shootingStarInterval;
function startShootingStars() {
    shootingStarInterval = setInterval(createShootingStar, 10000);
}

function stopShootingStars() {
    clearInterval(shootingStarInterval);
    document.querySelectorAll('.shooting-star').forEach(star => star.remove());
}

function createShootingStar() {
    const star = document.createElement('div');
    star.className = 'shooting-star';
    star.style.top = Math.random() * 20 + 'vh';
    star.style.right = '0';
    star.style.animation = 'shoot 2s linear backwards';
    document.body.appendChild(star);
    
    star.addEventListener('animationend', () => star.remove());
}

// Randomly swirl the theme toggle icon
function startRandomSwirl() {
    const themeToggle = document.querySelector('.theme-toggle');
    setInterval(() => {
        if (Math.random() < 0.1 && !document.body.classList.contains('dark-mode')) { 
            const angle = Math.random() < 0.5 ? 360 : -360;
            themeToggle.style.setProperty('--rotation-angle', `${angle}deg`);
            themeToggle.classList.add('swirling');
            setTimeout(() => {
                themeToggle.classList.remove('swirling');
            }, 1000);
        }
    }, 1000);
}
