// src/components/RainbowButton.jsx

import React from 'react';
import styled from 'styled-components';

// 1. Accept a new 'fullWidth' prop
const RainbowButton = ({ label, theme, fullWidth, onClick }) => {
  return (
    // 2. Pass it down to the styled component
    <StyledWrapper theme={theme} $fullWidth={fullWidth} onClick={onClick}>
      <button className="rainbow-hover">
        <span className="sp">{label}</span>
      </button>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  /* This makes the wrapper div expand if the button inside is full width */
  width: ${props => (props.$fullWidth ? '100%' : 'auto')};

  .rainbow-hover {
    font-size: 14px;
    font-weight: 600;
    border: none;
    outline: none;
    cursor: pointer;
    padding: 8px 16px;
    position: relative;
    line-height: 20px;
    border-radius: 9px;
    transition: all 0.3s;
    background-color: ${props => (props.theme === 'dark' ? '#2B3044' : '#F0F0F0')};
    border: ${props => (props.theme === 'dark' ? 'none' : '1px solid #D1D1D1')};
    box-shadow: ${props => (props.theme === 'dark' ? '0px 1px 2px #2B3044, 0px 4px 16px #2B3044' : '0px 1px 2px #FFFFFF, 0px 4px 16px #D1D1D1')};
    
    /* 3. Make the button itself full width if the prop is true */
    width: ${props => (props.fullWidth ? '100%' : 'auto')};
  }

  .sp {
    background: linear-gradient(90deg, #866ee7, #ea60da, #ed8f57, #fbd41d, #2cca91);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-fill-color: transparent;
    display: block;
  }

  .rainbow-hover:active {
    transform: scale(0.93);
  }
`;

export default RainbowButton;