import { useEffect, useState, useRef } from 'react'
import Papa from 'papaparse'
import './App.css'

// Cores para os shapes positivos
const POSITIVE_COLORS = ['#99F2AE', '#FFFFFF']

// Cor para shapes com problemas
const PROBLEM_COLOR = '#342D37'

// Cores que devem ter texto do autor em preto
const LIGHT_BG_COLORS = ['#FFFFFF', '#99F2AE']

// Função para determinar se a cor é escura (para texto da descrição)
const isDark = (color) => {
  const hex = color.replace('#', '').toUpperCase()
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}

// Função para determinar se o autor deve ser preto ou branco
const shouldAuthorBeBlack = (color) => {
  const normalizedColor = color.toUpperCase()
  return LIGHT_BG_COLORS.some(c => c.toUpperCase() === normalizedColor)
}

// Palavras-chave que indicam problemas/reclamações
const PROBLEM_KEYWORDS = [
  'problema', 'problemas', 'erro', 'erros', 'bug', 'bugs',
  'não funciona', 'não está funcionando', 'não consigo',
  'travando', 'travou', 'trava', 'lento', 'lenta',
  'atualização', 'atualizacao', 'atualizar', 'update',
  'péssimo', 'pessimo', 'ruim', 'horrível', 'horrivel',
  'reclamação', 'reclamacao', 'suporte', 'ajuda',
  'não abre', 'não carrega', 'crashando', 'crash',
  'demora', 'demorado', 'instável', 'instavel',
  'fechando sozinho', 'fecha sozinho', 'se fecha'
]

// Função para detectar se a mensagem contém problemas
const hasProblem = (content) => {
  if (!content) return false
  const lowerContent = content.toLowerCase()
  return PROBLEM_KEYWORDS.some(keyword => lowerContent.includes(keyword))
}

// Espaçamento igual para todas as bordas e gap
const SPACING = 16

// Velocidade do auto-scroll (pixels por frame)
const AUTO_SCROLL_SPEED = 1.035

// Número de shapes por coluna
const NUM_SHAPES = 40

function App() {
  const [positiveReviews, setPositiveReviews] = useState([])
  const [problemReviews, setProblemReviews] = useState([])
  const [currentOffset, setCurrentOffset] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight)
  const [numColumns, setNumColumns] = useState(2)
  const [mode, setMode] = useState('manual')
  const [targetOffset, setTargetOffset] = useState(0)
  const [velocity, setVelocity] = useState(0)
  const [isDecelerating, setIsDecelerating] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const animationRef = useRef(null)

  // Carregar CSV
  useEffect(() => {
    Papa.parse('/reviews_5_stars.csv', {
      download: true,
      header: true,
      complete: (results) => {
        // Filtrar reviews com conteúdo
        const validReviews = results.data
          .filter(row => row.author && row.content && row.content.length > 10)
        
        // Separar reviews positivas e com problemas
        const positive = []
        const problems = []
        
        validReviews.forEach((row) => {
          if (hasProblem(row.content)) {
            problems.push(row)
          } else {
            positive.push(row)
          }
        })
        
        // Limitar para performance
        setPositiveReviews(positive.slice(0, 200))
        setProblemReviews(problems.slice(0, 100))
        setIsLoading(false)
      },
      error: (error) => {
        console.error('Erro ao carregar CSV:', error)
        setIsLoading(false)
      }
    })
  }, [])

  // Função para truncar texto
  const truncateText = (text, maxLength) => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength).trim() + '...'
  }

  // Gerar conteúdo para cada coluna com offset
  const getColumnContent = (columnIndex, isLastColumn) => {
    // Última coluna usa reviews com problemas quando tem 2, 3 ou 4 colunas
    const isProblemsColumn = isLastColumn && numColumns >= 2 && problemReviews.length > 0
    const sourceReviews = isProblemsColumn ? problemReviews : positiveReviews
    
    if (sourceReviews.length === 0) return []
    
    const offset = columnIndex * 10
    return Array.from({ length: NUM_SHAPES }, (_, i) => {
      const reviewIndex = (i + offset) % sourceReviews.length
      // Cor baseada no tipo de coluna
      const bgColor = isProblemsColumn 
        ? PROBLEM_COLOR 
        : POSITIVE_COLORS[i % POSITIVE_COLORS.length]
      const review = sourceReviews[reviewIndex]
      
      return {
        author: truncateText(review.author, 30),
        content: truncateText(review.content, 400),
        bgColor,
        isLight: !isDark(bgColor),
        authorBlack: shouldAuthorBeBlack(bgColor)
      }
    })
  }

  // Calcula quantas linhas visíveis baseado no número de colunas
  const getVisibleRows = () => {
    switch (numColumns) {
      case 1:
      case 2:
        return 1
      case 3:
      case 4:
        return 2
      default:
        return 1
    }
  }

  // Calcula o fator de escala da fonte baseado no número de colunas
  const getFontScale = () => {
    switch (numColumns) {
      case 1:
        return 1 // 100%
      case 2:
        return 0.6 // 60% (40% menor)
      case 3:
        return 0.42 // 42% (30% menor que 2 colunas)
      case 4:
        return 0.4 // 40% (20% maior)
      default:
        return 1
    }
  }

  const fontScale = getFontScale()

  const visibleRows = getVisibleRows()
  const availableHeight = viewportHeight - (SPACING * 2)
  const shapeHeight = (availableHeight - (SPACING * (visibleRows - 1))) / visibleRows
  const itemHeight = shapeHeight + SPACING
  
  const getInitialOffset = () => {
    return (NUM_SHAPES - visibleRows) * itemHeight
  }
  
  const initialDownOffset = getInitialOffset()
  const maxOffset = (NUM_SHAPES - visibleRows) * itemHeight

  const lerp = (start, end, factor) => {
    return start + (end - start) * factor
  }

  // Animation loop unificado
  useEffect(() => {
    const animate = () => {
      setCurrentOffset(prev => {
        if (mode === 'auto') {
          let newOffset = prev + AUTO_SCROLL_SPEED
          if (newOffset >= maxOffset) {
            newOffset = 0
          }
          setTargetOffset(newOffset)
          setVelocity(AUTO_SCROLL_SPEED)
          return newOffset
        } else if (isDecelerating) {
          setVelocity(v => {
            const newVelocity = v * 0.95
            if (newVelocity < 0.1) {
              setIsDecelerating(false)
              const scrollSpeed = 0.5
              window.scrollTo(0, prev / scrollSpeed)
              return 0
            }
            return newVelocity
          })
          
          let newOffset = prev + velocity * 0.95
          if (newOffset >= maxOffset) {
            newOffset = maxOffset
            setIsDecelerating(false)
          }
          setTargetOffset(newOffset)
          return newOffset
        } else {
          const diff = Math.abs(targetOffset - prev)
          const easingFactor = 0.08
          
          if (diff < 0.5) {
            return targetOffset
          }
          
          return lerp(prev, targetOffset, easingFactor)
        }
      })
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [mode, targetOffset, maxOffset, isDecelerating, velocity])

  const handleModeChange = (newMode) => {
    if (newMode === 'manual' && mode === 'auto') {
      setVelocity(AUTO_SCROLL_SPEED)
      setIsDecelerating(true)
    }
    setMode(newMode)
  }

  useEffect(() => {
    const handleScroll = () => {
      if (mode === 'manual' && !isDecelerating) {
        const scrollSpeed = 0.5
        const rawOffset = window.scrollY * scrollSpeed
        const clampedOffset = Math.min(Math.max(rawOffset, 0), maxOffset > 0 ? maxOffset : 0)
        setTargetOffset(clampedOffset)
      }
    }

    const handleResize = () => {
      setViewportHeight(window.innerHeight)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [mode, maxOffset, isDecelerating])

  // Reset offset quando muda número de colunas
  useEffect(() => {
    setCurrentOffset(0)
    setTargetOffset(0)
    window.scrollTo(0, 0)
  }, [numColumns])

  const scrollSpeed = 0.5
  const scrollAreaHeight = mode === 'manual' 
    ? (maxOffset / scrollSpeed) + viewportHeight 
    : viewportHeight

  const handleColumnToggle = (index) => {
    if (index + 1 === numColumns && numColumns === 1) return
    
    if (index < numColumns) {
      const newNum = Math.max(1, index)
      setNumColumns(newNum === 0 ? 1 : newNum)
    } else {
      setNumColumns(index + 1)
    }
  }

  const columns = Array.from({ length: numColumns }, (_, index) => {
    const isLastColumn = index === numColumns - 1
    const content = getColumnContent(index, isLastColumn)
    const goesUp = index % 2 === 0
    
    return {
      id: index,
      content,
      goesUp,
      isProblems: isLastColumn && numColumns >= 2 && problemReviews.length > 0
    }
  })

  const getColumnTransform = (goesUp) => {
    if (goesUp) {
      return `translateY(${-currentOffset}px)`
    } else {
      return `translateY(${-initialDownOffset + currentOffset}px)`
    }
  }

  if (isLoading) {
    return (
      <div className={`app ${isDarkMode ? 'dark' : 'light'}`}>
        <div className="loading">Carregando reviews...</div>
      </div>
    )
  }

  return (
    <div className={`app ${isDarkMode ? 'dark' : 'light'}`}>
      <div 
        className="scroll-area" 
        style={{ height: scrollAreaHeight }}
      />

      <div className="floating-menu">
        <div className="reports-counter">
          <span className="counter-item">
            <span className="counter-label">Total de reports:</span>
            <span className="counter-value">{positiveReviews.length + problemReviews.length}</span>
          </span>
          <span className="counter-divider">/</span>
          <span className="counter-item">
            <span className="counter-label">Reports negativos:</span>
            <span className="counter-value negative">{problemReviews.length}</span>
          </span>
        </div>

        <div className="menu-divider" />

        <div className="column-selector">
          {[0, 1, 2, 3].map(index => (
            <button
              key={index}
              className={`column-box ${index < numColumns ? 'active' : ''}`}
              onClick={() => handleColumnToggle(index)}
              aria-label={`Coluna ${index + 1}`}
            />
          ))}
        </div>

        <div className="menu-divider" />

        <div className="mode-toggle">
          <span className={`mode-label ${mode === 'auto' ? 'active' : ''}`}>AUTO</span>
          <button 
            className="toggle-switch"
            onClick={() => handleModeChange(mode === 'auto' ? 'manual' : 'auto')}
            aria-label="Alternar modo"
          >
            <div className={`toggle-thumb ${mode === 'manual' ? 'right' : 'left'}`} />
          </button>
          <span className={`mode-label ${mode === 'manual' ? 'active' : ''}`}>MANUAL</span>
        </div>

        <div className="menu-divider" />

        {/* Dark Mode Toggle */}
        <button 
          className="theme-toggle"
          onClick={() => setIsDarkMode(!isDarkMode)}
          aria-label="Alternar tema"
        >
          {isDarkMode ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>
      
      <div 
        className="fixed-container"
        style={{ 
          padding: SPACING, 
          gap: SPACING,
          '--font-scale': fontScale
        }}
      >
        {columns.map(column => (
          <div 
            key={column.id}
            className="column"
            style={{
              transform: getColumnTransform(column.goesUp),
              gap: SPACING
            }}
          >
            {column.content.map((item, index) => (
              <div 
                key={index}
                className={`shape ${item.isLight ? 'shape-light' : 'shape-dark'}`}
                style={{ 
                  height: shapeHeight,
                  backgroundColor: item.bgColor
                }}
              >
                <div className="shape-content">
                  <p className="shape-text">{item.content}</p>
                  <span className={`shape-author ${item.authorBlack ? 'author-black' : 'author-white'}`}>{item.author}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
