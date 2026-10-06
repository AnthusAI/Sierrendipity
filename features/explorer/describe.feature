Feature: Describing a machine word in plain English
  Each card in Course 1 is one real 32-bit word. describe(word) gives the friendly text on the
  face of the card, plus coloured parts so the interface can highlight boxes and numbers.
  Expected words come from the library's own assembler, so they are real encodings.

  Scenario Outline: Every card has exact, friendly text and a kind
    When I assemble "<assembly>" and describe its word
    Then the word is <word>
    And the card kind is "<kind>"
    And the card text is "<text>"
    And the card is not a fallback

    Examples: cards
      | assembly             | word       | kind                | text |
      | addi a0, zero, 5     | 0x00500513 | put                 | Put 5 in box a0 |
      | addi a2, zero, 42    | 0x02a00613 | put                 | Put 42 in box a2 |
      | addi a0, zero, -3    | 0xffd00513 | put                 | Put -3 in box a0 |
      | addi a1, a1, 7       | 0x00758593 | add-number          | Add 7 to box a1 |
      | addi a1, a1, -2      | 0xffe58593 | add-number          | Take 2 away from box a1 |
      | add a2, a0, a1       | 0x00b50633 | add-boxes           | Add box a0 and box a1, put the answer in box a2 |
      | sub a2, a0, a1       | 0x40b50633 | subtract-boxes      | Subtract box a1 from box a0, put the answer in box a2 |
      | sb t0, 1024(zero)    | 0x40500023 | paint-pixel         | Paint pixel 0 with the colour in box t0 |
      | sb t0, 1030(zero)    | 0x40500323 | paint-pixel         | Paint pixel 6 with the colour in box t0 |
      | sb t0, 100(zero)     | 0x06500223 | save                | Copy one byte of box t0 onto shelf 100 |
      | sw t0, 1024(zero)    | 0x40502023 | save                | Copy box t0 onto shelf 1024 |
      | sw t0, 8(sp)         | 0x00512423 | save                | Copy box t0 onto the shelf at box sp plus 8 |
      | lw t1, 1024(zero)    | 0x40002303 | fetch               | Fetch the number on shelf 1024 into box t1 |
      | lw a0, 4(sp)         | 0x00412503 | fetch               | Fetch the number on the shelf at box sp plus 4 into box a0 |
      | lw a0, 0(sp)         | 0x00012503 | fetch               | Fetch the number on the shelf at box sp into box a0 |
      | bne t0, t1, -8       | 0xfe629ce3 | jump-if-different   | If box t0 and box t1 differ, jump back 2 cards |
      | bne t0, zero, 8      | 0x00029463 | jump-if-different   | If box t0 and box zero (always 0) differ, jump forward 2 cards |
      | beq a0, a1, 12       | 0x00b50663 | jump-if-same        | If box a0 and box a1 match, jump forward 3 cards |
      | blt t0, t1, -4       | 0xfe62cee3 | jump-if-smaller     | If box t0 is smaller than box t1, jump back 1 card |
      | bge t0, t1, 8        | 0x0062d463 | jump-if-not-smaller | If box t0 is not smaller than box t1, jump forward 2 cards |
      | bltu t0, t1, 8       | 0x0062e463 | jump-if-smaller     | If box t0 is smaller than box t1 (counting from 0 up), jump forward 2 cards |
      | bgeu t0, t1, 8       | 0x0062f463 | jump-if-not-smaller | If box t0 is not smaller than box t1 (counting from 0 up), jump forward 2 cards |
      | bne t0, t1, 0        | 0x00629063 | jump-if-different   | If box t0 and box t1 differ, jump to this same card again |
      | ebreak               | 0x00100073 | stop                | Stop |
      | addi a1, a0, 0       | 0x00050593 | copy                | Copy box a0 into box a1 |
      | add a1, zero, a0     | 0x00a005b3 | copy                | Copy box a0 into box a1 |
      | addi a1, a0, 3       | 0x00350593 | add-number          | Put box a0 plus 3 into box a1 |
      | addi a1, a0, -3      | 0xffd50593 | add-number          | Put box a0 minus 3 into box a1 |
      | addi zero, zero, 0   | 0x00000013 | do-nothing          | Do nothing |
      | slt a0, a1, a2       | 0x00c5a533 | compare             | Put 1 in box a0 if box a1 is smaller than box a2, otherwise 0 |
      | sltu a0, a1, a2      | 0x00c5b533 | compare             | Put 1 in box a0 if box a1 is smaller than box a2 (counting from 0 up), otherwise 0 |
      | slti a0, a1, 10      | 0x00a5a513 | compare             | Put 1 in box a0 if box a1 is smaller than 10, otherwise 0 |
      | and a0, a1, a2       | 0x00c5f533 | logic               | Combine box a1 and box a2 bit by bit with AND, put the answer in box a0 |
      | or a0, a1, a2        | 0x00c5e533 | logic               | Combine box a1 and box a2 bit by bit with OR, put the answer in box a0 |
      | xor a0, a1, a2       | 0x00c5c533 | logic               | Combine box a1 and box a2 bit by bit with XOR, put the answer in box a0 |
      | andi a0, a1, 255     | 0x0ff5f513 | logic               | Combine box a1 and 255 bit by bit with AND, put the answer in box a0 |
      | xori a0, a1, -1      | 0xfff5c513 | logic               | Flip every bit of box a1, put the answer in box a0 |
      | slli a0, a0, 3       | 0x00351513 | shift               | Slide the bits of box a0 left 3 places, put the answer in box a0 |
      | srli a0, a1, 2       | 0x0025d513 | shift               | Slide the bits of box a1 right 2 places, put the answer in box a0 |
      | srai a0, a1, 2       | 0x4025d513 | shift               | Slide the bits of box a1 right 2 places, keeping the sign, put the answer in box a0 |
      | sll a0, a1, a2       | 0x00c59533 | shift               | Slide the bits of box a1 left by the amount in box a2, put the answer in box a0 |
      | jal zero, 12         | 0x00c0006f | jump                | Jump forward 3 cards |
      | jal ra, -8           | 0xff9ff0ef | jump                | Jump back 2 cards, remembering the way back in box ra |
      | jalr zero, 0(ra)     | 0x00008067 | jump-to-box         | Jump to the card whose address is in box ra |
      | jalr ra, 8(t0)       | 0x008280e7 | jump-to-box         | Jump to the card whose address is box t0 plus 8, remembering the way back in box ra |
      | lui t0, 0x12345      | 0x123452b7 | big-number          | Put the big number 0x12345000 in box t0 |
      | auipc t0, 1          | 0x00001297 | big-number          | Put this card's address plus 0x1000 in box t0 |
      | mul a0, a1, a2       | 0x02c58533 | multiply            | Multiply box a1 by box a2, put the answer in box a0 |
      | ecall                | 0x00000073 | ask-system          | Ask the machine to do the job named in box a7 |
      | lb t1, 1030(zero)    | 0x40600303 | fetch               | Fetch one byte from shelf 1030 into box t1 (a byte of 200 arrives as -56) |
      | lbu t1, 1030(zero)   | 0x40604303 | fetch               | Fetch one byte from shelf 1030 into box t1 (never negative) |
      | lh t1, 1030(zero)    | 0x40601303 | fetch               | Fetch two bytes from shelf 1030 into box t1 (a value of 40000 arrives as -25536) |
      | lhu t1, 1030(zero)   | 0x40605303 | fetch               | Fetch two bytes from shelf 1030 into box t1 (never negative) |
      | sh t0, 1030(zero)    | 0x40501323 | save                | Copy two bytes of box t0 onto shelf 1030 |
      | sh t0, 4(sp)         | 0x00511223 | save                | Copy two bytes of box t0 onto the shelf at box sp plus 4 |
      | mulh a0, a1, a2      | 0x02c59533 | multiply            | Multiply box a1 by box a2 (both signed), put the top half of the answer in box a0 |
      | mulhsu a0, a1, a2    | 0x02c5a533 | multiply            | Multiply box a1 (signed) by box a2 (counting from 0 up), put the top half of the answer in box a0 |
      | mulhu a0, a1, a2     | 0x02c5b533 | multiply            | Multiply box a1 by box a2 (counting from 0 up), put the top half of the answer in box a0 |
      | div a0, a1, a2       | 0x02c5c533 | divide              | Divide box a1 by box a2, put the whole-number answer in box a0 (dividing by 0 gives -1) |
      | divu a0, a1, a2      | 0x02c5d533 | divide              | Divide box a1 by box a2 (counting from 0 up), put the whole-number answer in box a0 (dividing by 0 gives 4294967295) |
      | rem a0, a1, a2       | 0x02c5e533 | divide              | Divide box a1 by box a2, put what is left over in box a0 (dividing by 0 leaves box a1 as it was) |
      | remu a0, a1, a2      | 0x02c5f533 | divide              | Divide box a1 by box a2 (counting from 0 up), put what is left over in box a0 (dividing by 0 leaves box a1 as it was) |
      | sltiu a0, a1, 1      | 0x0015b513 | compare             | Put 1 in box a0 if box a1 is smaller than 1 (counting from 0 up), otherwise 0 |
      | sltiu a0, a1, -1     | 0xfff5b513 | compare             | Put 1 in box a0 if box a1 is smaller than 4294967295 (counting from 0 up), otherwise 0 |
      | addi zero, zero, 7   | 0x00700013 | do-nothing          | Do nothing: the answer would go in box zero (always 0), which never changes |
      | add zero, a0, a1     | 0x00b50033 | do-nothing          | Do nothing: the answer would go in box zero (always 0), which never changes |
      | sub zero, a0, a1     | 0x40b50033 | do-nothing          | Do nothing: the answer would go in box zero (always 0), which never changes |
      | lw zero, 4(sp)       | 0x00412003 | do-nothing          | Do nothing: the answer would go in box zero (always 0), which never changes |
      | lui zero, 1          | 0x00001037 | do-nothing          | Do nothing: the answer would go in box zero (always 0), which never changes |
      | slli zero, a0, 2     | 0x00251013 | do-nothing          | Do nothing: the answer would go in box zero (always 0), which never changes |
      | bne t0, t1, 6        | 0x00629363 | jump-if-different   | If box t0 and box t1 differ, jump to an address that does not start a card (the machine will fault) |
      | jal zero, 6          | 0x0060006f | jump                | Jump to an address that does not start a card (the machine will fault) |
      | lw t1, -4(zero)      | 0xffc02303 | fetch               | Fetch the number on shelf -4 into box t1 |
      | sw t0, -8(zero)      | 0xfe502c23 | save                | Copy box t0 onto shelf -8 |
      | fence                | 0x0ff0000f | memory-order        | Pause until earlier memory jobs finish, so they stay in order |

  Scenario Outline: A word that is not an instruction says so
    When I describe the word <word>
    Then the card text is "Not an instruction the machine understands"
    And the card is a fallback
    And the card kind is "unknown"

    Examples: words the decoder rejects
      | word       |
      | 0x00000000 |
      | 0xffffffff |
      | 0x00000001 |

  Scenario: A word that is not a number does not crash
    When I describe the word NaN
    Then the card text is "Not an instruction the machine understands"

  Scenario Outline: Knowing the card's own address lets jumps name a card
    When I assemble "<assembly>" and describe its word at address <pc>
    Then the card text is "<text>"

    Examples: jumping to an absolute card number
      | assembly       | pc | text                                          |
      | bne t0, t1, -8 | 20 | If box t0 and box t1 differ, jump to card 3     |
      | beq a0, a1, 12 | 8  | If box a0 and box a1 match, jump to card 5      |
      | blt t0, t1, -4 | 4  | If box t0 is smaller than box t1, jump to card 0 |
      | jal zero, 12   | 0  | Jump to card 3                                  |
      | jal ra, -8     | 16 | Jump to card 2, remembering the way back in box ra |

  Scenario: A jump that would land before the first card keeps its relative wording
    When I assemble "bne t0, t1, -40" and describe its word at address 8
    Then the card text is "If box t0 and box t1 differ, jump back 10 cards"

  Scenario Outline: The vocabulary switches from boxes to registers for later courses
    When I assemble "<assembly>" and describe its word with the "<vocabulary>" vocabulary
    Then the card text is "<text>"

    Examples: Course 1 says boxes and shelves; later courses say registers and memory
      | assembly           | vocabulary | text                                                                 |
      | addi a0, zero, 5   | boxes      | Put 5 in box a0                                                      |
      | addi a0, zero, 5   | registers  | Put 5 in register a0                                                 |
      | add a2, a0, zero   | registers  | Copy register a0 into register a2                                    |
      | bne t0, zero, -8   | registers  | If register t0 and register zero (always 0) differ, jump back 2 instructions |
      | bne t0, t1, -4     | registers  | If register t0 and register t1 differ, jump back 1 instruction       |
      | sw t0, 1024(zero)  | registers  | Copy register t0 onto memory address 1024                            |
      | lw t1, 4(sp)       | registers  | Fetch the number at the memory address in register sp plus 4 into register t1 |
      | sb t0, 1024(zero)  | registers  | Paint pixel 0 with the colour in register t0                         |
      | ecall              | registers  | Ask the machine to do the job named in register a7                   |
      | addi zero, zero, 7 | registers  | Do nothing: the answer would go in register zero (always 0), which never changes |
      | bne t0, t1, 6      | registers  | If register t0 and register t1 differ, jump to an address that does not start an instruction (the machine will fault) |

  Scenario: The default vocabulary is boxes
    When I assemble "addi a0, zero, 5" and describe its word
    Then the card text is "Put 5 in box a0"

  Scenario: Parts carry roles so the interface can colour them
    When I assemble "sw t0, 1024(zero)" and describe its word
    Then the card parts are
      | role  | text           |
      | verb  | "Copy"         |
      | text  | " "            |
      | box   | "box t0"       |
      | text  | " onto "       |
      | label | "shelf"        |
      | text  | " "            |
      | shelf | "1024"         |
    And the parts join to the card text

  Scenario: Branch parts name the boxes and the distance
    When I assemble "bne t0, t1, -8" and describe its word
    Then the card parts have these roles in order
      | text | box | text | box | text | verb | text | number | text | label |
    And the parts join to the card text

  Scenario: Every part of every Course 1 card joins back into its text
    Given the Course 1 sample cards
    Then every card's parts join to its text

  Scenario: Card kinds are a fixed list for the Instruction Deck
    Then the known card kinds include
      | put | add-number | add-boxes | subtract-boxes | paint-pixel | save | fetch | jump-if-different | jump-if-smaller | stop | unknown |
    And the known card kinds have no duplicates

  Scenario: The Instruction Deck lists the distinct kinds a program uses
    When I list the cards used by
      """
      addi t0, zero, 3
      addi t1, zero, 0
      addi t1, t1, 2
      addi t0, t0, -1
      bne t0, zero, -8
      sb t1, 1024(zero)
      ebreak
      """
    Then the cards used are "put, add-number, paint-pixel, jump-if-different, stop"

  Scenario: Unknown words show up in the deck too
    When I list the cards used by the words 0x00500513, 0xffffffff, 0x00500513
    Then the cards used are "put, unknown"

  Scenario: An empty program uses no cards
    When I list the cards used by the words
    Then the cards used are ""
