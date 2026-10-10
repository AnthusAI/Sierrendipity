@web @course
Feature: The course path
  Learn is the course: one Continue button, the current lesson large, the next one dim, later lessons in fog
  (titles only), passed lessons as small stars and side rooms as small doors. Workspace is the IDE.

  Background:
    Given a mock backend that needs 0 ms to start
    And a course of five lessons

  # Landing and navigation

  Scenario: A new student lands on Learn
    When I open the app at "/"
    Then I am on "/learn"
    And I see the heading "Course 1"

  Scenario: A student who finished Course 1 lands in the Workspace
    Given the student has passed "Press the Button"
    And the student has passed "Change the Number"
    And the student has passed "Last One Wins"
    And the student has passed "Two Boxes"
    And the student has passed "Add"
    When I open the app at "/"
    Then I am on "/workspace"
    And the Run button is there

  Scenario: Learn and Workspace are switched from the header
    When I open the app at "/learn"
    Then the header offers "Learn" and "Workspace" and "Learn" is the current area
    When I switch to the "Workspace" area
    Then I am on "/workspace"
    And the Run button is there
    When I switch to the "Learn" area
    Then I am on "/learn"
    And I see the heading "Course 1"

  Scenario: The Workspace keeps its state while I visit Learn
    When I open the app at "/workspace"
    And I create the file "notes.txt"
    And I switch to the "Learn" area
    And I switch to the "Workspace" area
    Then the file tree lists "notes.txt"

  Scenario: Settings open from Learn and keep the appearance flow working
    When I open the app at "/learn"
    And I open Settings
    And I choose the color theme "Warm"
    And I close Settings
    Then the color theme is "warm"

  Scenario: The browser back button goes back through the areas
    When I open the app at "/learn"
    And I switch to the "Workspace" area
    And I go back
    Then I am on "/learn"

  # One primary button

  Scenario Outline: Exactly one primary Continue button: <state>
    Given <progress>
    When I open the app at "/learn"
    Then there is exactly one primary button named "<button>"

    Examples:
      | state             | progress                                                                      | button                                      |
      | nothing passed    | the student has passed nothing                                                | Continue: Press the Button, about 3 min     |
      | in the middle     | the student has passed "Press the Button" and "Change the Number"             | Continue: Last One Wins, about 4 min        |
      | all passed        | the student has passed every lesson                                           | Continue: open the Workspace                |
      | a skipped lesson  | the student has passed "Press the Button" and "Last One Wins"                 | Continue: Change the Number, about 3 min    |

  Scenario: The Continue button starts the current lesson
    When I open the app at "/learn"
    And I press the primary button
    Then I am on "/learn/c1/01-press-the-button"
    And I see the heading "Press the Button"
    And I see "about 3 min"

  Scenario: When everything is passed Continue opens the Workspace
    Given the student has passed every lesson
    When I open the app at "/learn"
    And I press the primary button
    Then I am on "/workspace"

  # The fog-of-war path

  Scenario: The current lesson is large, the next is dim and later lessons are fog with titles only
    Given the student has passed "Press the Button"
    When I open the app at "/learn"
    Then the lesson "Change the Number" is the "current" lesson
    And the lesson "Last One Wins" is the "next" lesson
    And the lesson "Two Boxes" is in fog showing only its title
    And the lesson "Add" is in fog showing only its title
    And the page shows no lock icon

  Scenario: The page never overwhelms: at most three lessons are prominent
    Given the student has passed "Press the Button"
    And the student has passed "Change the Number"
    And the student has passed "Last One Wins"
    When I open the app at "/learn"
    Then exactly these lessons are prominent: "Last One Wins", "Two Boxes", "Add"

  Scenario: Passed lessons are small stars with text labels
    Given the student has passed "Press the Button"
    And the student has passed "Last One Wins" earning the stars "called-it, another-way"
    When I open the app at "/learn"
    Then the lesson "Press the Button" shows the stars "Passed"
    And the lesson "Last One Wins" shows the stars "Passed, Called it, Another way"

  Scenario: Fog never reaches a lesson that is not current, even through the address bar
    Given the student has passed "Press the Button"
    When I open the app at "/learn/c1/04-two-boxes"
    Then I see the heading "Not open yet"
    And there is no "Mark as passed (dev)" button

  # Side rooms

  Scenario: A side room is a dim door that says what opens it
    When I open the app at "/learn"
    Then the door "Hex secrets" is closed and says "Opens after you pass Change the Number"

  Scenario: Passing the lesson without the star says which star opens the door
    Given the student has passed "Press the Button"
    And the student has passed "Change the Number"
    When I open the app at "/learn"
    Then the door "Hex secrets" is closed and says "Opens with the star Another way"

  Scenario: A bonus star opens the side room
    Given the student has passed "Press the Button"
    And the student has passed "Change the Number" earning the stars "another-way"
    When I open the app at "/learn"
    Then the door "Hex secrets" is open
    When I press the door "Hex secrets"
    Then I am on "/learn/c1/02-change-the-number"
    And I see "Hex secrets"

  Scenario: Doors of lessons still in fog are not shown
    When I open the app at "/learn"
    Then there is no door "Red door"

  # Choice at a branch

  Scenario: A branch point offers a two-card chooser
    Given the course also offers "Sticky Notes" as an alternate to "Two Boxes"
    And the student has passed "Press the Button"
    And the student has passed "Change the Number"
    And the student has passed "Last One Wins"
    When I open the app at "/learn"
    Then I am offered to pick what's next: "Two Boxes" or "Sticky Notes"
    And there is exactly one primary button named "Continue: Two Boxes, about 4 min"
    When I pick "Sticky Notes"
    Then there is exactly one primary button named "Continue: Sticky Notes, about 5 min"

  Scenario: Passing one alternate settles the branch
    Given the course also offers "Sticky Notes" as an alternate to "Two Boxes"
    And the student has passed "Press the Button"
    And the student has passed "Change the Number"
    And the student has passed "Last One Wins"
    And the student has passed "Sticky Notes"
    When I open the app at "/learn"
    Then I am not offered a choice
    And there is no lesson "Two Boxes" on the path
    And the lesson "Add" is the "current" lesson

  # What you can do now

  Scenario: The recap lists what passed lessons taught
    Given the student has passed "Press the Button"
    And the student has passed "Change the Number"
    When I open the app at "/learn"
    Then "What you can do now" lists "Step a program one card at a time." and "Spin a number on a card."

  Scenario: No recap before anything is passed
    When I open the app at "/learn"
    Then there is no "What you can do now" list

  # Tutor override

  Scenario: Unlock all is off by default and sits under Settings, Learning
    When I open the app at "/learn"
    And I open Settings
    Then Settings has a "Learning" section with "Unlock all lessons" off

  Scenario: Unlock all makes every lesson open, still with one primary button
    When I open the app at "/learn"
    And I open Settings
    And I turn on "Unlock all lessons"
    And I close Settings
    Then I can open the lesson "Two Boxes" from the path
    And there is exactly one primary button named "Continue: Press the Button, about 3 min"
    When I open the app at "/learn/c1/04-two-boxes"
    Then I am on "/learn/c1/04-two-boxes"
    And I see the heading "Two Boxes"

  Scenario: Reset my progress asks first and then starts over
    Given the student has passed "Press the Button"
    When I open the app at "/learn"
    And I open Settings
    And I press "Reset my progress"
    Then I am asked "Reset your progress?"
    When I cancel the question
    Then Settings is still open
    When I press "Reset my progress"
    And I confirm the question "Reset"
    And I close Settings
    Then there is exactly one primary button named "Continue: Press the Button, about 3 min"

  # The lesson seam

  Scenario: The placeholder lesson page has no pass button for students
    When I open the app at "/learn/c1/01-press-the-button"
    Then I see the heading "Press the Button"
    And there is no "Mark as passed (dev)" button

  Scenario: The dev pass button writes a pass into the progress store
    When I open the app at "/learn/c1/01-press-the-button?dev=1"
    And I press "Mark as passed (dev)"
    And I go to "/learn"
    Then there is exactly one primary button named "Continue: Change the Number, about 3 min"
    And the stored progress says "Press the Button" is passed

  # Keyboard and layout

  Scenario: The path can be used with the keyboard alone
    When I open the app at "/learn"
    And I press Tab until focus is on "Continue: Press the Button, about 3 min"
    And I press the key "Enter"
    Then I am on "/learn/c1/01-press-the-button"

  Scenario: The sections of Learn can be reached with the keyboard alone
    When I open the app at "/learn"
    And I press Tab until focus is on the link "Gallery"
    And I press the key "Enter"
    Then I am on "/learn/gallery"
    And I see the heading "Gallery"

  Scenario: Focus is always visible on the path
    When I open the app at "/learn"
    And I press Tab until focus is on "Continue: Press the Button, about 3 min"
    Then the focused element has a visible focus ring

  Scenario Outline: The path fits 1024 by 768 without overlap in a <state> course
    Given the viewport is 1024 by 768
    And <progress>
    When I open the app at "/learn"
    Then no two items on the path overlap and nothing is cut off at the sides
    And the Continue button is visible without scrolling

    Examples:
      | state    | progress                                                                                  |
      | new      | the student has passed nothing                                                            |
      | middle   | the student has passed "Press the Button" and "Change the Number" earning the stars "another-way" |
      | finished | the student has passed every lesson                                                       |

  # Contrast

  Scenario Outline: Everything on the path is readable in <theme> <mode>
    Given the saved settings are the theme "<theme>" and the mode "<mode>"
    And the student has passed "Press the Button"
    And the student has passed "Change the Number" earning the stars "another-way, called-it"
    And the student has passed "Last One Wins"
    When I open the app at "/learn"
    Then every piece of text on the page has enough contrast
    And the focus ring of the Continue button has enough contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  # Two students on one browser

  Scenario: Two students on one browser keep separate progress
    Given Cognito is the hosted UI at "https://auth.example.test"
    And the IDE is opened with sign-in required
    And I press "Sign in with Google"
    And Google sends me back to Learn as "ada@example.test" whose subject is "sub-ada"
    Then I am on "/learn"
    When I go to "/learn/c1/01-press-the-button?dev=1"
    And I press "Mark as passed (dev)"
    And I go to "/learn"
    Then there is exactly one primary button named "Continue: Change the Number, about 3 min"
    When I press "Sign out"
    And I press "Sign in with Google"
    And Google sends me back to Learn as "bob@example.test" whose subject is "sub-bob"
    Then there is exactly one primary button named "Continue: Press the Button, about 3 min"
    When I press "Sign out"
    And I press "Sign in with Google"
    And Google sends me back to Learn as "ada@example.test" whose subject is "sub-ada"
    Then there is exactly one primary button named "Continue: Change the Number, about 3 min"
