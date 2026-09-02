"""MoTeC i2 Workspace Template Generator for HorizonTuner.

Generates pre-configured MoTeC i2 workspace templates (.xml / .mtcproj)
tailored for Forza Horizon 6 60Hz telemetry analysis.
"""


def generate_motec_workspace_xml(workspace_name: str = "FH6 HorizonTuner Pro") -> str:
    """Generates a standard MoTeC i2 Pro XML workspace definition.

    Pre-configures 5 dedicated sheets:
    1. Driver Inputs & G-G Friction Circle
    2. Suspension Travel & Damper Dynamics
    3. Tire Thermals & Slip Dynamics
    4. AEGO Gearing & Engine Powerband
    5. Track Map & Sector Comparison
    """
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<MoTeCWorkspace Version="1.0" Name="{workspace_name}">
  <Details>
    <Author>FH6-HorizonTuner</Author>
    <Description>Standard 60Hz telemetry analysis workspace for Forza Horizon 6 / Forza Motorsport.</Description>
    <GeneratedBy>FH6-HorizonTuner MoTeC Bridge</GeneratedBy>
  </Details>
  <Worksheets>
    <Worksheet Name="Driver &amp; Dynamics">
      <Layout Type="Grid">
        <Group Name="Driver Inputs">
          <Channels>
            <Channel Name="Ground Speed" Unit="km/h" Color="#00FF00" />
            <Channel Name="Throttle Pos" Unit="%" Color="#00F0FF" />
            <Channel Name="Brake Pos" Unit="%" Color="#FF003C" />
            <Channel Name="Steered Angle" Unit="%" Color="#FFAA00" />
            <Channel Name="Gear" Unit="" Color="#FFFFFF" />
          </Channels>
        </Group>
        <Group Name="G-G Friction Circle">
          <Plot Type="Scatter">
            <XAxis Channel="G Force Lat" Min="-2.5" Max="2.5" Unit="G" />
            <YAxis Channel="G Force Long" Min="-2.5" Max="2.5" Unit="G" />
          </Plot>
        </Group>
      </Layout>
    </Worksheet>

    <Worksheet Name="Suspension &amp; Travel">
      <Layout Type="Grid">
        <Group Name="Suspension Travel Percentage">
          <Channels>
            <Channel Name="Susp Pos FL" Unit="%" Color="#00FF00" />
            <Channel Name="Susp Pos FR" Unit="%" Color="#00F0FF" />
            <Channel Name="Susp Pos RL" Unit="%" Color="#FFAA00" />
            <Channel Name="Susp Pos RR" Unit="%" Color="#FF003C" />
          </Channels>
        </Group>
        <Group Name="Suspension Meters">
          <Channels>
            <Channel Name="Susp Travel FL" Unit="m" Color="#00FF00" />
            <Channel Name="Susp Travel FR" Unit="m" Color="#00F0FF" />
            <Channel Name="Susp Travel RL" Unit="m" Color="#FFAA00" />
            <Channel Name="Susp Travel RR" Unit="m" Color="#FF003C" />
          </Channels>
        </Group>
      </Layout>
    </Worksheet>

    <Worksheet Name="Tires &amp; Slip Dynamics">
      <Layout Type="Grid">
        <Group Name="Tire Temperatures">
          <Channels>
            <Channel Name="Tire Temp FL" Unit="°C" Color="#00FF00" />
            <Channel Name="Tire Temp FR" Unit="°C" Color="#00F0FF" />
            <Channel Name="Tire Temp RL" Unit="°C" Color="#FFAA00" />
            <Channel Name="Tire Temp RR" Unit="°C" Color="#FF003C" />
          </Channels>
        </Group>
        <Group Name="Slip Angles (deg)">
          <Channels>
            <Channel Name="Slip Angle FL" Unit="deg" Color="#00FF00" />
            <Channel Name="Slip Angle FR" Unit="deg" Color="#00F0FF" />
            <Channel Name="Slip Angle RL" Unit="deg" Color="#FFAA00" />
            <Channel Name="Slip Angle RR" Unit="deg" Color="#FF003C" />
          </Channels>
        </Group>
        <Group Name="Slip Ratios">
          <Channels>
            <Channel Name="Slip Ratio FL" Unit="" Color="#00FF00" />
            <Channel Name="Slip Ratio FR" Unit="" Color="#00F0FF" />
            <Channel Name="Slip Ratio RL" Unit="" Color="#FFAA00" />
            <Channel Name="Slip Ratio RR" Unit="" Color="#FF003C" />
          </Channels>
        </Group>
      </Layout>
    </Worksheet>

    <Worksheet Name="Engine &amp; Gearing">
      <Layout Type="Grid">
        <Group Name="Engine Dyno &amp; Boost">
          <Channels>
            <Channel Name="Engine RPM" Unit="rpm" Color="#00FF00" />
            <Channel Name="Engine Power" Unit="hp" Color="#FFAA00" />
            <Channel Name="Engine Torque" Unit="Nm" Color="#7000FF" />
            <Channel Name="Boost Pressure" Unit="psi" Color="#00F0FF" />
          </Channels>
        </Group>
      </Layout>
    </Worksheet>

    <Worksheet Name="Track Map &amp; GPS">
      <Layout Type="TrackMap">
        <GPSChannels Lat="GPS Latitude" Lon="GPS Longitude" Alt="GPS Altitude" Speed="Ground Speed" />
      </Layout>
    </Worksheet>
  </Worksheets>
</MoTeCWorkspace>
"""
    return xml_content.strip()
