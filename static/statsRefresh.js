function openStatsRefreshModal() {
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 20px;">통계 데이터 최신화</h3>
            
            <div style="margin-bottom: 20px;">
                <p style="font-size: 14px; color: #666;">
                    모든 주문 데이터를 기반으로 통계를 다시 계산합니다.
                </p>
            </div>
            
            <div id="refreshProgressDiv" style="display: none;">
                <div style="margin: 20px 0;">
                    <div style="background: #f0f0f0; height: 30px; border-radius: 5px; overflow: hidden;">
                        <div id="refreshProgressBar" style="width: 0%; height: 100%; background: #007bff; transition: width 0.3s;"></div>
                    </div>
                    <div id="refreshStatus" style="margin-top: 10px; text-align: center; color: #666;">준비 중...</div>
                </div>
            </div>
            
            <p style="color: #dc3545; font-size: 12px; margin-top: 15px;">
                ⚠️ 전체 데이터 재계산은 시간이 걸릴 수 있습니다.
            </p>
        </div>
    `;
    
    const footerHTML = `
        <button id="startRefreshBtn" onclick="startStatsRefresh()" style="background: #28a745; color: white;">최신화 시작</button>
        <button onclick="closeModal()" style="background: #6c757d; color: white;">취소</button>
    `;
    
    window.openModal({
        title: '통계 최신화',
        bodyHTML: modalHTML,
        footerHTML: footerHTML
    });
}


async function startStatsRefresh() {
    const progressDiv = document.getElementById('refreshProgressDiv');
    const startBtn = document.getElementById('startRefreshBtn');
    
    progressDiv.style.display = 'block';
    startBtn.disabled = true;
    
    const updateProgress = (percent, status) => {
        document.getElementById('refreshProgressBar').style.width = percent + '%';
        document.getElementById('refreshStatus').textContent = status;
    };
    
    try {
        updateProgress(10, '데이터 조회 중...');
        
        const response = await fetch(`${window.API_BASE_URL}/stats/refresh`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ days: 0 })
        });
        
        if (!response.ok) throw new Error('통계 재계산 실패');
        
        // 진행률 시뮬레이션 (실제로는 SSE나 WebSocket 사용 권장)
        updateProgress(30, '주문 데이터 분석 중...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        updateProgress(60, '입점사별 집계 중...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        updateProgress(90, '랭킹 계산 중...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        updateProgress(100, '완료!');
        
        setTimeout(() => {
            alert('통계 데이터가 최신화되었습니다.');
            window.closeModal();
            location.reload();  // 대시보드 새로고침
        }, 500);
        
    } catch (error) {
        alert('통계 최신화 실패: ' + error.message);
        startBtn.disabled = false;
    }
}

window.openStatsRefreshModal = openStatsRefreshModal;
window.startStatsRefresh = startStatsRefresh;