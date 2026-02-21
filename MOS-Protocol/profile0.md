2.1 Profile 0 – Basic Communication
This Profile enables basic MOS XML message exchange and discovery between applications and machines using TCP/IP sockets.

 

Messages required for support of Profile 0:

 

heartbeat

reqMachInfo

listMachInfo

 

General Work Flow for Profile 0

 

·        Establish communication to another MOS device

 

·        Send a <heartbeat> message to another application and receive a <heartbeat> message in response

 

·        Send a <reqMachInfo> message to another application and receive a <listMachInfo> message in response.

 

Implementation Notes

 

This Profile encompasses the most basic requirements and functions to support MOS Protocol message transfer.  The three basic messages included in this profile, <heartbeat>, <reqMachInfo> and <listMachInfo> can be exchanged between any MOS v2.8.4 compliant devices

 

Profile 0 required MOS message support

 

heartbeat

 

The heartbeat message is designed to allow one application to confirm to another that it is still alive and communications between the two machines is viable.

 

An application will respond to a heartbeat message with another heartbeat message.  However, care should be taken in implementation of this message to avoid an endless looping condition on response.

 


Recommended Work Practice:  It is useful for a MOS Protocol enabled application to be aware of the three levels of connectivity which are required for MOS message exchange:

 

1)     Network Connectivity:  You must be able to "Ping" the remote machine hosting the application with which you wish to communicate.

 

2)     Socket Connectivity:  You must be able to establish a socket connection with the remote application

3)     Application Response:  You must be able to receive a <heartbeat> message in response to the <heartbeat> message you have transmitted.

 

If you can send a <heartbeat> message and receive a <heartbeat> message in response you have verified the continuity at all three levels.

 

Each heartbeat message contains a time stamp.  This gives each application the opportunity to synchronize time of day, with a relatively low degree of precision, and to be aware of the other machine’s local offset from GMT.

 

 

reqMachInfo

 

This message is a request for the target machine to respond with a listMachInfo message.

 

 

listMachInfo

 

This message allows the machine to identify itself with manufacturer, model, hardware and software revisions, and MOS profiles supported, etc. 

 

This message identifies which MOS Profiles the application supports, as well as the device type. 

 

Optionally, the machine may also identify information necessary for remote devices to install and configure an associated ActiveX control.

 

Recommended Work Practice:  Applications may optionally use the information contained in this message to provide automatic or semi-automatic configuration.

 

 

General Explanation of MOS message format and construction

 

 

Identification

 

In practice the MOS and NCS character names are predefined in each system and IP addresses associated with each name.

 

Encoding

 

The supported character encoding is ISO 10646 (Unicode) in UCS-2, as defined in The Unicode Standard, version 2.0. All MOS message contents are transmitted in Unicode, high-order byte first, also known as "big endian."

 

MOS Message Format

 

The MOS Protocol is fundamentally a tagged text data stream. In versions 2.x, data fields are character delimited using Extensible Markup Language (XML™) tags defined in the MOS Data Type Definition (DTD). In MOS v1.x data fields were delimited using a proprietary format.

 

Extensible Markup Language (XML)

 

The syntax of MOS v2.8.4 is an application of XML, an international standard for describing document content structure. XML is a simple, flexible text format based on SGML (ISO 8879). XML is an abbreviated version of SGML, to make it easier for you to define your own document types, and to make it easier for developers to write programs to handle them. It omits the more complex and less-used parts of SGML, in return for the benefits of being easier to write applications, easier to understand, and more suited to delivery and interoperability over the Web.

 

All tags are case sensitive. All MOS messages must be well formed XML, but are not required to be valid.

 

Each MOS message begins with the root tag ("mos"), followed by the MOS and NCS ID ("mosID" and "ncsID"), and followed by the message type. Data follows in tagged form.

 

Vendors are encouraged to add CR/LF and Tabs within a message to improve readability for debugging purposes.

 

Unknown Tags

 

Should a MOS or NCS encounter an unknown message or data tag the device will ignore the tag and the data and continue to process the message. Unknown data tags will not generate an application error. The application has the option of indicating a warning.

 

Data Format for Object <description> field

 

The value of Object <description> is restricted to plain Unicode UCS-2 text that includes Tab, CR,/LF and the optional markup for paragraphs, tabs and emphasis. Formatted text such as HTML, RTF, etc. will not be allowed in the unstructured description area.

 

Languages

 The following rules apply:

 

·         Data tags and meaningful constants (like UPDATE) are formatted as English

·         Data Fields containing string values (like title, etc…) can contain other languages.

·         Data Fields containing datatime, time or number values are formatted as English and have the formats defined in the Section 6 "Field Descriptions"

Numbers


Numbers are formatted as their text equivalent, e.g.:

      The decimal number 100 is represented as text "100".

      Hex FF55 is represented as text "0xFF55" or "xFF55".

 

Running Orders

 

1) Running Order (Unique ID - may appear only once in the NCS and MOS)

   2) Story (Unique ID - may appear only once in the RO)

      3) Item (Unique ID - may appear only once in a story)

         4) Object (Unique ID - may appear only once in an item)

 

It is assumed that all Unique ID’s (UID’s) created by one machine are respected by others.

 

Order of data fields within an item is significant.

 

Items are sent in the intended order they will be played.

 

Order of items is significant.

 

Multiple Running Orders may contain the same Story.

 

Running Orders may contain zero or more Stories.

 

Multiple stories can contain the same Object referenced by different Items.

 

Stories can contain multiple Items.

 

Item IDs may appear only once in a Story, but can appear in other Stories.

 

Objects can appear multiple times in a Story, but only one object may appear in an Item.

 

A Running Order Item is defined by the combination Running Order.Story.Item and contains the UID’s of the Running Order, Story and Item which together can identify a unique Item within a Running Order. Additions, deletions, and moves within the running order are referenced in this way to the Item.

 

Definition of Object Sample Rate

 

Still Store and Character Generator media objects are defined as having 1 sample per second. They are special cases that require the NCS and MOS applications to understand they do not change every second.


Message Transport
 

MOS Lower Port (10540) is defined as the default TCP/IP port on which the NCS will accept connections from MOS devices. Multiple simultaneous connections are supported. This socket is referred to as "Media Object Metadata" port in the Message Types section.

 

MOS Upper Port (10541) is defined as the default TCP/IP port on which the MOS will accept connections from the NCS.  Multiple simultaneous connections are supported.  This socket is referred to as "Running Order" port in the Message Types section.

 

MOS uses two ports bi-directionally.  Applications will simultaneously listen for messages on both ports – see Message Exchange below.

 

NOTE:Ports 10520 and 10521 were specified as Lower and Upper Ports in previous versions of the MOS Protocol.  Beginning in version 2.5  these ports are vendor selectable but site specific.   All MOS enabled machines within a site or enterprise should communicate using the same ports.

 

Because some vendors reported problems using port 10521 with Microsoft Windows NT the new port numbers used as examples are now 10540 and 10541.

 

For example, a NCS initiated a create running order command and the MOS' associated ACK would take place on MOS Upper Port (10541). Object updates sent from the MOS and the associated NCS ACK would take place on MOS Lower Port (10540).

 

Message Exchange

 

To send a MOS message from MOS to NCS or vice versa: 

 

1.      An application will open a socket on the appropriate port to the receiving device if a socket has not already been established.

 

2.      The application will then send the message.

 

3.      The application will then hold the socket open and wait for an Ack message to be returned on the same socket before either dropping the socket or transmitting the next message.

 

4.      Optionally, either device may send <heartbeat> messages at regular intervals to the other machine and wait for a response.

 

Recommended Work Practice: It is not necessary to disconnect the socket once the ACK has been received.  It may be more efficient and require less overhead to simply leave the socket open until the next message is transmitted, even if this is not immediate.  If the socket is dropped the application should re-establish the socket before the next message is transmitted.

 

Important Application Note:  When a socket is closed, either locally or remotely, care should be taken to ensure the socket is completely disconnected.  This is a 4 step process involving communication between both machines.  Socket tear down is normally taken care of at a level below application development.  However, if problems are experienced establishing a socket between machines after at least one socket connection has been established and then dropped, this may be a sign the first socket was not properly closed.  Check the status of all network connections on both machines. Indications of  "FIN_WAIT_2" or "CLOSE_WAIT" on ports used for MOS communications are a sign of a problem.

 

 

Both the NCS and MOS can originate messages.  Transmitted messages require a response from the receiver before the transmitter will attempt to send the next message in the queue belonging to that specific port (either upper or lower).  Upper and lower port messages are not related so that while a machine is waiting for a response on the lower port it may continue to have a dialog on the upper port.

 

Note:  "Two Ports - Four Sockets"  Each pair of communicating machines uses two ports.  Each machine must be able to accept and handle messages on a minimum of two sockets per port.  Once established, socket connections do not need to be dropped and

then re-established between messages.  Generally, the acknowledgment of a message will be sent down the same socket on which the original message was received.  However, machines should be able to handle situations in which each message arrives in a separate, discrete socket session (though this is not very efficient).

 

                                           /----Socket
                    Lower Port (10540)----<
                                           \----Socket2


                                            /----Socket1
                    Upper Port (10541)----<
                                            \----Socket2


Note:  "Multiple MOS Connections" Each machine (NCS and MOS) will be capable of establishing and maintaining connections to multiple systems of the opposite type.  e.g. An NCS will be capable of connecting to multiple Media Object Servers.  Media Object Servers will also be capable of connecting to multiple NCSs.


Message Acknowledgement

 

When a message is sent by a device to a target device, that device will not send another message to the target device on the same port until it receives an acknowledgement ("ACK") or error ("NACK") from the target device.

 

MOS enabled equipment and applications will retry when a timeout occurs. This applies to all messages on the same port. 

 

Message acknowledgment on one port is independent of the flow of messages on the other port.

 

If a message is not acknowledged, it and all subsequent waiting messages will be buffered. 

 

Recommended Work Practice:  It is recommended that these messages be buffered in such a way that machine or application restart or reset will not destroy these buffered messages.