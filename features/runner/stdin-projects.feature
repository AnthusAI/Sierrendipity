Feature: Run Python and C projects with supplied stdin
  Programs can read the input a student provides.

  Scenario Outline: Programs read from stdin
    Given a <language> project
    And the file "<file>" containing:
      """
      <source>
      """
    And the stdin "<input>"
    When the project is run
    Then the status is "ok"
    And the program output is "<output>"

    Examples:
      | language | file    | source                                                                            | input | output |
      | Python   | main.py | print(int(input()) * 2)                                                           | 21\n  | 42\n   |
      | C        | main.c  | #include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d",a+b);} | 3 4\n | 7      |
