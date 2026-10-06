Feature: Run a multi-file C++ project
  As a student I can submit several source files and see what they print.

  Scenario: Compile and run two source files
    Given a C++ project
    And the file "util.h" containing:
      """
      #pragma once
      const char* greeting();
      """
    And the file "util.cpp" containing:
      """
      #include "util.h"
      const char* greeting() { return "Hello from util"; }
      """
    And the file "main.cpp" containing:
      """
      #include <iostream>
      #include "util.h"
      int main() { std::cout << greeting() << "\n"; }
      """
    When the project is run
    Then the status is "ok"
    And the exit code is 0
    And the program output is "Hello from util\n"

  Scenario: A compile error is reported
    Given a C++ project
    And the file "main.cpp" containing:
      """
      #include <iostream>
      int main() {
        std::cout << "hi" << std::endl
      }
      """
    When the project is run
    Then the status is "compile_error"
    And the compiler output mentions "main.cpp:3"
    And the program was not executed
