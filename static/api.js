

// === API 기본 설정 ===
window.API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''  // ← 수정됨: 빈 문자열로 변경
    : 'https://ablcrossborder-production.up.railway.app';

console.log('API 서버:', window.API_BASE_URL || '현재 도메인');

// === 토큰 관리 ===
function saveToken(token) {
    localStorage.setItem('token', token);
}

function getToken() {
    return localStorage.getItem('token');
}

function removeToken() {
    localStorage.removeItem('token');
}

function isLoggedIn() {
    return !!getToken();
}

// === API 호출 헬퍼 함수 ===
async function apiCall(endpoint, options = {}) {
    const token = getToken();
    
    const config = {
        ...options,
        headers: {
            ...options.headers,
        }
    };
    
    // JSON 요청인 경우 Content-Type 설정
    if (!(options.body instanceof FormData)) {
        config.headers['Content-Type'] = 'application/json';
    }
    
    // 토큰이 있으면 Authorization 헤더 추가
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${window.API_BASE_URL}${endpoint}`, config);
        
        // 401 에러시 로그인 페이지로 리다이렉트
        if (response.status === 401) {
            removeToken();
            window.location.href = '/static/login.html';
            throw new Error('인증이 만료되었습니다.');
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API 호출 실패:', error);
        throw error;
    }
}

// === 로그인 함수 ===
async function login(username, password) {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await fetch(`${window.API_BASE_URL}/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });
    
    if (!response.ok) {
        throw new Error('로그인 실패');
    }
    
    const data = await response.json();
    if (data.access_token) {
        saveToken(data.access_token);
        localStorage.setItem('userType', data.user_type);
        return true;
    }
    return false;
}

// === 로그아웃 함수 ===
function logout() {
    removeToken();
    localStorage.removeItem('userType');
    window.location.href = '/static/login.html';
}

// === 사용자 정보 가져오기 ===
async function getCurrentUser() {
    try {
        return await apiCall('/me');
    } catch (error) {
        console.error('사용자 정보 가져오기 실패:', error);
        return null;
    }
}

// === 입점사 API ===
window.sellersAPI = window.sellersAPI || {  // let 대신 window 사용
    // 입점사 목록 조회
    async list() {
        return await apiCall('/sellers');
    },
    
    // 입점사 생성
    async create(sellerData) {
        return await apiCall('/sellers', {
            method: 'POST',
            body: JSON.stringify(sellerData)
        });
    },
    
    // 입점사 수정
    async update(sellerId, sellerData) {
        return await apiCall(`/sellers/${sellerId}`, {
            method: 'PUT',
            body: JSON.stringify(sellerData)
        });
    },
    
    // 입점사 조회
    async get(sellerId) {
        return await apiCall(`/sellers/${sellerId}`);
    }
};

// === 제품 API === (api.js에서 찾아서 수정)
window.productsAPI = window.productsAPI || {
    // 제품 목록 조회
    async list(includeInactive = false) {
        const params = includeInactive ? '?include_inactive=1' : '';
        return await apiCall(`/products${params}`);
    },
    
    // 제품 생성 (FormData로)
    async create(productData) {
        const formData = new FormData();
        Object.keys(productData).forEach(key => {
            if (productData[key] !== null && productData[key] !== undefined) {
                formData.append(key, productData[key]);
            }
        });
        
        return await apiCall('/products', {
            method: 'POST',
            body: formData
        });
    },
    
    // 제품 수정 (FormData로 변경!)
    async update(productId, productData) {
        const formData = new FormData();
        Object.keys(productData).forEach(key => {
            if (productData[key] !== null && productData[key] !== undefined) {
                formData.append(key, productData[key]);
            }
        });
        
        return await apiCall(`/products/${productId}`, {
            method: 'PUT',
            body: formData  // ✅ FormData로 전송
        });
    },
    
    // 제품 조회
    async get(productId) {
        return await apiCall(`/products/${productId}`);
    },
    
    // 제품 삭제
    async delete(productId) {
        return await apiCall(`/products/${productId}`, {
            method: 'DELETE'
        });
    }
};

// === 계정 API ===
// === 계정 API ===
window.accountsAPI = window.accountsAPI || {
    // 계정 목록 조회
    async list() {
        return await apiCall('/accounts');
    },
    
    // 계정 생성
    async create(accountData) {
        const response = await fetch(`${API_BASE_URL}/accounts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'  // 추가
            },
            body: JSON.stringify(accountData)
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.detail || '계정 생성 실패');
        }
        
        return response.json();
    },
    
    // 계정 수정
    async update(accountId, accountData) {
        const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'  // 추가
            },
            body: JSON.stringify(accountData)
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new Error(error?.detail || '계정 수정 실패');
        }
        
        return response.json();
    }
};

// === 페이지 로드시 로그인 체크 ===
document.addEventListener('DOMContentLoaded', function() {
    // login.html이 아닌 경우에만 로그인 체크
    if (!window.location.pathname.includes('login.html')) {
        if (!isLoggedIn()) {
           window.location.href = '/static/login.html';
        } else {
            // 토큰이 유효한지 확인
            getCurrentUser().then(user => {
                if (!user) {
                    logout();
                } else {
                    console.log('현재 사용자:', user.username, '(', user.type, ')');
                    
                    // 권한에 따른 메뉴 표시/숨김 처리
                    if (user.type !== 'admin') {
                        // seller 계정인 경우 일부 메뉴 숨김
                        const adminOnlyMenus = ['menu-sellers', 'menu-account'];
                        adminOnlyMenus.forEach(menuId => {
                            const menu = document.getElementById(menuId);
                            if (menu) menu.style.display = 'none';
                        });
                    }
                }
            });
        }
    }
});

// === 전역 객체로 노출 ===
window.API = {
    login,
    logout,
    getCurrentUser,
    sellers: window.sellersAPI,
    products: productsAPI,
    accounts: accountsAPI,
    isLoggedIn,
    API_BASE_URL: window.API_BASE_URL  // 변경
};

// 파일 맨 아래에 추가 (기존 코드 뒤)
// ImageKit 업로드 헬퍼
// 파일 맨 아래에 추가 (기존 코드 뒤)
// ImageKit 이미지 업로드 헬퍼 함수
window.uploadToImageKit = async function(file, productId, imageType = 'thumbnail') {
    try {
        // 1. 서버에서 인증 정보 가져오기
        const authResponse = await fetch(`${window.API_BASE_URL}/api/imagekit/auth`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!authResponse.ok) {
            throw new Error('인증 정보 가져오기 실패');
        }
        const auth = await authResponse.json();
        
        // 파일명 생성 (imageType 포함)
        const timestamp = Date.now();
        const extension = file.name.split('.').pop();
        const fileName = `${imageType}_${productId}_${timestamp}.${extension}`;
        
        // 2. FormData 생성
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', fileName);
        formData.append('publicKey', auth.publicKey);
        formData.append('signature', auth.signature);
        formData.append('expire', auth.expire);
        formData.append('token', auth.token);
        formData.append('useUniqueFileName', 'true');
        formData.append('folder', '/products');
        
        // 3. ImageKit에 업로드
        const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await uploadResponse.json();
        
        if (!uploadResponse.ok) {
            console.error('ImageKit 에러:', result);
            throw new Error(result.message || '이미지 업로드 실패');
        }
        
        console.log(`${imageType} 업로드 성공:`, result);
        return result.url;
        
    } catch (error) {
        console.error('업로드 에러:', error);
        throw error;
    }
};