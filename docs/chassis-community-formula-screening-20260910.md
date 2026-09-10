# 底盤公式：社群先驗與工程模型篩選

依使用者要求，子代理chassis_heuristics查找Forza社群與賽車工程來源。結論是保留三層用途，避免把代數等價寫法當成獨立候選逐一試跑。這是研究篩選，不是正式產品公式變更。

## 1. 主模型：各車基準相對修正

`u_i = Q_i[clip(u_i0 (1+e_i))]`。輸入為實際基準、合法刻度與範圍；以單軸測點和相鄰基準辨識反應。5%弱效應才擴一次10%，見[自適應規則](mx5-adaptive-step-heuristics-20260910.md)。這與`u_i=u_i0 exp(theta_i)`在`theta=log(1+e)`時生成相同設定；不是兩套物理模型。不同座標上的線性回歸或懲罰可以不同，不能把換元稱成性能收斂。

沿用[主要泛用模型](chassis-general-model-20260910.md)，不加入未驗證的RWD/AWD固定倍率。

## 2. 低成本先驗：配重滑桿插值

Senistr於2021-12-09原帖給出 `u_i=L_i+(U_i-L_i)p_i`，前`p`後`1-p`，用於彈簧／ARB／阻尼。[Basic formula for spring rate?](https://forums.forza.net/t/basic-formula-for-spring-rate/537503)。查找時搜尋索引可見作者與公式，直接開舊帖重導向首頁，存取限制保留；這是社群經驗而非官方規格。

等價式`(u-L)/(U-L)=p`：保證的是正規化滑桿位置等於配重。前後相同L/U時，`uF+uR=L+U`，但一般`uF/uR != p/(1-p)`；只有L=0或p=0.5等對稱特例才相等。前後範圍不同時總值也不恆定。`64p+1`及`19p+1`只是範圍1～65／1～20的同一公式，不值得視為新模型；版本實際範圍必須讀回。

沒有基準且只有遊戲可見數據時，可作待驗起始值；已有可靠基準時，不為了套公式而增加變更。它不能從配重唯一推出最佳剛度。

## 3. 物理參考：頻率、阻尼比與側傾分配

每輪簧上質量ms用kg；定義q=彈簧位移/輪位移，局部線性近似：

    kw = ks q²
    fn = sqrt(kw/ms)/(2π)
    ks = (2π fn)² ms/q²          [N/m]
    ccrit = 2 sqrt(kw ms)
    cw = ζ ccrit = 4π ζ fn ms   [N·s/m]
    cdamper = cw/qd²

qd是阻尼器運動比，不一定等於彈簧q。OptimumG使用倒數MR=輪/彈簧位移，故ks=(2πfn)²msMR²，完全等價。[輪端剛度與運動比](https://optimumg.com/wp-content/uploads/2021/10/racecar-2020_11.pdf)、[Spring Brake](https://optimumg.com/spring-brake/)。頻率法與臨界阻尼法應合併成一個模型；遊戲阻尼滑桿未校準，不能當成N·s/m。

    ksF/ksR = (msF/msR)(fF/fR)²(qR/qF)²

按配重分配彈簧只是前後頻率相同、運動比相同且所用配重等於簧上配重的特例。固定「車重×常數×配重」把頻率、運動比、簧上比例與單位藏進常數，最多是明確標記的先驗。

較高後頻率可用於flat ride，但高阻尼賽車也可能取較高前頻率，不能從RWD標籤直接定方向。[OptimumG Springs & Dampers Part One](https://optimumg.com/wp-content/uploads/2020/01/SpringsDampers_Tech_Tip_1.pdf)。真車MX-5幾何與零件不自動等於遊戲升級配置；[社群Tuning Calculator v2，第2頁](https://forums.forza.net/t/updated-tuning-calculator-v2/85000?page=2)也存在引入運動比／簧上假設的討論，未提供滑桿直接物理校準證明。

小角度、左右對稱且kw為每輪剛度時：

    Kphi_spring,i ≈ kw_i ti²/2  [N·m/rad]
    Kphi_i = Kphi_spring,i + Kphi_ARB,i
    Kphi_T = Kphi_F + Kphi_R
    alpha = Kphi_F/Kphi_T
    Kphi_ARB,F = alpha Kphi_T - Kphi_spring,F

因此ARB需同時指定總側傾剛度與分配；彈簧也有貢獻，不能把ARB滑桿比直接當側傾分配，更不能把無單位ARB與N/m彈簧相加。[OptimumG Bar Talk](https://optimumg.com/bar-talk/)。alpha也不是完整側向荷重轉移分配，還缺輪距、幾何與簧下項；[工程課程第5頁](https://optimumg.com/wp-content/uploads/2022/04/OptimumG-Data-Driven-Perfomance-Engineering-4-Day-Seminar-Description-of-seminar-content.pdf)將各概念分列。

## 篩選決策

- 保留基準相對修正作現階段主模型，不要求使用者猜ms、q、理想Hz。
- 保留滑桿插值作低成本先驗／對照，不當物理定律；實際上下限缺失時不產生可套用候選。
- 合併頻率、critical damping和側傾分配為物理參考模型，待輸入及滑桿映射校準後再評估性能。
- 固定bump/rebound比例只作初值；不是臨界阻尼定律。AWD前ARB最軟／後最硬降為待驗社群配方，不硬編碼到泛用模型。
- 下一個試驗按入彎／彎中／出彎、行程與滑移證據選參數。單靠最佳圈或驅動型式不足以定方向。實測效果若不支持，不因公式有名氣而保留。
