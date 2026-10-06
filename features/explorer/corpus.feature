Feature: The differential test corpus
  The Docker-only differential specs feed a generated corpus to GNU as. This Docker-free check
  keeps the corpus honest, so the Docker run does not fail on a typo in the corpus itself.

  Scenario: The corpus assembles with the explorer and exercises every mnemonic
    Then the generated corpus assembles without errors and covers every RV32IM mnemonic
